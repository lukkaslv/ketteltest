import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Check, Save, Users, Copy, FileText, Activity, Download, BrainCircuit } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { toPng } from 'html-to-image';
import { questions as bigFiveQuestions, traitsSummary as bigFiveSummary, Trait as BigFiveTrait } from './data';
import { cattellQuestions, cattellSummary, CattellTrait } from './cattellData';
import { cattellQuestionsKa, cattellSummaryKa } from './cattellDataKa';
import { auth, db, signInWithGoogle, logOut } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './firebaseHelpers';

type AnswerMap = Record<number, number>;

export default function App() {
  const [testType, setTestType] = useState<'bigfive' | 'cattell' | 'cattell_ka' | null>(null);
  const [testStarted, setTestStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [isFinished, setIsFinished] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedResult, setSavedResult] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [partnerData, setPartnerData] = useState<any>(null);
  const [isLoadingPartner, setIsLoadingPartner] = useState(false);
  const [partnerError, setPartnerError] = useState('');
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [viewedHistoricalResult, setViewedHistoricalResult] = useState<any>(null);

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiCompatibility, setAiCompatibility] = useState<string | null>(null);
  const [isAnalyzingCompatibility, setIsAnalyzingCompatibility] = useState(false);

  const loadHistory = async () => {
    if (!user) return;
    setIsLoadingHistory(true);
    setShowHistory(true);
    try {
      const q = query(collection(db, 'results', user.uid, 'history'), orderBy('updatedAt', 'desc'));
      const qs = await getDocs(q).catch(e => {
        handleFirestoreError(e, OperationType.LIST, `results/${user.uid}/history`);
        return null;
      });
      if (qs) {
        setTestHistory(qs.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  const activeQuestions = testType === 'bigfive' ? bigFiveQuestions : testType === 'cattell_ka' ? cattellQuestionsKa : cattellQuestions;
  const activeSummary = testType === 'bigfive' ? bigFiveSummary : testType === 'cattell_ka' ? cattellSummaryKa : cattellSummary;
  const currentQuestion = activeQuestions[currentIndex];
  // Calculate progress relative to the chosen questionnaire
  const progressPercentage = testType ? ((currentIndex) / activeQuestions.length) * 100 : 0;

  const likertOptions = testType === 'bigfive' ? [
    { value: 1, label: 'Категорически не согласен' },
    { value: 2, label: 'Не согласен' },
    { value: 3, label: 'Нейтрально' },
    { value: 4, label: 'Согласен' },
    { value: 5, label: 'Полностью согласен' },
  ] : currentQuestion && 'options' in currentQuestion ? (currentQuestion as any).options.map((opt: string, i: number) => ({
    value: i, label: opt
  })) : [
    { value: 0, label: 'Да' },
    { value: 1, label: 'Не уверен' },
    { value: 2, label: 'Нет' },
  ];

  const handleAnswer = (value: number) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
    const isLast = currentIndex === activeQuestions.length - 1;
    setTimeout(() => {
      if (isLast) {
        setIsFinished(true);
      } else {
        setCurrentIndex(curr => Math.min(curr + 1, activeQuestions.length - 1));
      }
    }, 400);
  };

  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;

  const calculateScores = () => {
    if (!testType) return {};
    const traits = Object.keys(activeSummary);
    const scores: Record<string, number> = {};
    const minScores: Record<string, number> = {};
    const maxScores: Record<string, number> = {};
    traits.forEach(t => {
       scores[t] = 0;
       minScores[t] = 0;
       maxScores[t] = 0;
    });

    Object.entries(answers).forEach(([idStr, val]) => {
      const qId = parseInt(idStr, 10);
      const q = activeQuestions.find(q => q.id === qId);
      if (q && q.trait) {
        let rawScore = 0;
        if (testType === 'bigfive') {
            rawScore = q.sign > 0 ? val : (6 - val);
        } else {
            rawScore = (q as any).scoring ? (q as any).scoring[val] : 0;
        }

        // TS bypass for dynamic property
        (scores as any)[q.trait] += rawScore;
      }
    });

    const percentages: Record<string, number> = {};
    traits.forEach(t => {
      let minPossible = 0;
      let maxPossible = 0;

      Object.entries(answers).forEach(([idStr, val]) => {
         const qId = parseInt(idStr, 10);
         const q = activeQuestions.find(qq => qq.id === qId);
         if (q && q.trait === t) {
            if (testType === 'bigfive') {
               minPossible += 1;
               maxPossible += 5;
            } else {
               const maxS = Math.max(...((q as any).scoring || [0,0,0]));
               const minS = Math.min(...((q as any).scoring || [0,0,0]));
               minPossible += minS;
               maxPossible += maxS;
            }
         }
      });

      if (maxPossible > minPossible) {
         percentages[t] = Math.round(((scores[t] - minPossible) / (maxPossible - minPossible)) * 100);
      } else {
         percentages[t] = 0;
      }
    });

    return percentages;
  };

  const handleDownload = async () => {
    const element = document.getElementById('result-report');
    if (!element) return;
    try {
      const filter = (node: HTMLElement) => {
        const exclusionClasses = ['download-ignore'];
        return !node.dataset?.html2canvasIgnore;
      };
      
      const dataUrl = await toPng(element, { 
        cacheBust: true,
        filter: (node) => {
          if (node?.hasAttribute && node.hasAttribute('data-html2canvas-ignore') && node.getAttribute('data-html2canvas-ignore') === 'true') {
            return false;
          }
          return true;
        }
      });
      const link = document.createElement('a');
      link.download = `oceanic-profile-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Failed to download image', e);
    }
  };

  const handleAnalyze = async (finalScores: Record<string, number>, currentActiveSummary: any, activeTestType: string) => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testType: activeTestType,
          scores: finalScores,
          summary: currentActiveSummary,
          language: activeTestType === 'cattell_ka' ? 'ka' : 'ru'
        })
      });
      const data = await res.json();
      if (data.analysis) setAiAnalysis(data.analysis);
      else throw new Error(data.error);
    } catch (e) {
      console.error(e);
      setAiAnalysis('Ошибка генерации отчета. Попробуйте позже.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCompatibility = async (userScores: Record<string, number>, partScores: Record<string, number>, currentActiveSummary: any, activeTestType: string) => {
    setIsAnalyzingCompatibility(true);
    setAiCompatibility(null);
    try {
      const res = await fetch('/api/compatibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testType: activeTestType,
          userScores,
          partnerScores: partScores,
          summary: currentActiveSummary,
          language: activeTestType === 'cattell_ka' ? 'ka' : 'ru'
        })
      });
      const data = await res.json();
      if (data.analysis) setAiCompatibility(data.analysis);
      else throw new Error(data.error);
    } catch (e) {
      console.error(e);
      setAiCompatibility('Ошибка генерации совместимости. Попробуйте позже.');
    } finally {
      setIsAnalyzingCompatibility(false);
    }
  };

  const estimatedScores = useMemo(() => calculateScores(), [answers, testType]);

  const handleSaveResult = async (finalScores: Record<string, number>) => {
    try {
      setIsSaving(true);
      let currentUser = user;
      if (!currentUser) {
        currentUser = await signInWithGoogle();
      }
      
      const payload = {
        userId: currentUser.uid,
        displayName: currentUser.displayName || 'Пользователь',
        testType: testType,
        results: finalScores,
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'results', currentUser.uid), payload).catch(e => {
        handleFirestoreError(e, OperationType.WRITE, `results/${currentUser!.uid}`);
      });
      // Also save to history
      const historyRef = doc(collection(db, 'results', currentUser.uid, 'history'));
      await setDoc(historyRef, payload).catch(e => {
         handleFirestoreError(e, OperationType.WRITE, `results/${currentUser!.uid}/history`);
      });

      setSavedResult(true);
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении результатов');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompare = async () => {
    if (!partnerId) return;
    try {
      setIsLoadingPartner(true);
      setPartnerError('');
      const pDoc = await getDoc(doc(db, 'results', partnerId)).catch(e => {
        handleFirestoreError(e, OperationType.GET, `results/${partnerId}`);
      }) as any;
      
      if (!pDoc || !pDoc.exists()) {
        setPartnerError('Пользователь не найден');
        return;
      }
      const data = pDoc.data();
      if (data.testType !== testType) {
        setPartnerError(`Несовпадение тестов: партнер сдал ${data.testType === 'bigfive' ? 'Большую Пятерку' : data.testType === 'cattell_ka' ? 'Тест Кеттела (Грузинский)' : 'Тест Кеттела'}`);
        return;
      }
      setPartnerData(data);
    } catch (e) {
      console.error(e);
      setPartnerError('Ошибка при загрузке. Убедитесь, что ID верен и вы авторизованы.');
    } finally {
      setIsLoadingPartner(false);
    }
  };

  const renderHeader = () => (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 flex-shrink-0 sticky top-0 z-10 w-full">
      <div className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={() => window.location.reload()}>
        <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-white rounded-full"></div>
        </div>
        <span className="font-bold text-xl tracking-tight uppercase">Oceanic <span className="font-light text-slate-500">v2.4</span></span>
      </div>
      <div className="flex items-center gap-6 text-sm font-medium text-slate-600">
        {user ? (
           <div className="flex items-center gap-4 hidden sm:flex">
             <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 hidden md:inline">Ваш ID:</span>
                <code className="text-xs font-mono font-bold text-indigo-600 select-all">{user.uid}</code>
                <button onClick={() => navigator.clipboard.writeText(user.uid)} className="text-slate-400 hover:text-indigo-600 ml-1" title="Скопировать">
                   <Copy className="w-3.5 h-3.5" />
                </button>
             </div>
             <button onClick={loadHistory} className="text-slate-600 hover:text-indigo-600 font-medium whitespace-nowrap">История</button>
             <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
               <div className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold" title={user.displayName || ''}>{(user.displayName || 'U').charAt(0)}</div>
               <button onClick={logOut} className="text-slate-400 hover:text-slate-600 text-xs underline">Выйти</button>
             </div>
           </div>
        ) : (
           <button onClick={signInWithGoogle} className="text-indigo-600 font-bold hover:underline">Войти</button>
        )}
      </div>
    </header>
  );

  if (showHistory) {
    return (
      <div className="bg-slate-50 text-slate-900 min-h-screen flex flex-col font-sans">
        {renderHeader()}
        <main className="flex-1 p-4 sm:p-8 lg:p-12 overflow-y-auto w-full">
          <div className="max-w-4xl mx-auto bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
             <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-light text-slate-800">История тестов</h1>
                <button onClick={() => setShowHistory(false)} className="text-sm font-bold text-indigo-600 hover:text-indigo-700">Закрыть</button>
             </div>
             
             {isLoadingHistory ? (
                <div className="text-slate-500 py-12 text-center">Загрузка истории...</div>
             ) : testHistory.length === 0 ? (
                <div className="text-slate-500 py-12 text-center">У вас пока нет сохраненных результатов.</div>
             ) : (
                <div className="grid gap-4">
                  {testHistory.map(th => (
                     <div key={th.id} className="p-4 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div>
                           <div className="font-bold text-slate-800">{th.testType === 'bigfive' ? 'Большая Пятерка (Big Five)' : th.testType === 'cattell_ka' ? 'კეტელის 16-ფაქტორიანი ტესტი (Cattell)' : '16 Факторов Кеттела'}</div>
                           <div className="text-xs text-slate-400 mt-1">{th.updatedAt ? new Date(th.updatedAt.toDate()).toLocaleString() : ''}</div>
                        </div>
                        <button 
                           onClick={() => {
                              setViewedHistoricalResult(th);
                              setShowHistory(false);
                           }} 
                           className="text-sm px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                           Посмотреть
                        </button>
                     </div>
                  ))}
                </div>
             )}
          </div>
        </main>
      </div>
    );
  }

  if (!testType) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center p-4 w-full">
          <div className="max-w-4xl w-full">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-light text-slate-800 tracking-tight uppercase mb-4">Oceanic <span className="font-bold text-indigo-600">v2.4</span></h1>
              <p className="text-slate-500 max-w-xl mx-auto">Платформа профессиональной психодиагностики. Выберите тест для начала оценки.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button 
              onClick={() => setTestType('bigfive')}
              className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-lg transition-all text-left flex flex-col items-center text-center group"
            >
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <FileText className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Большая Пятерка<br/>(Big Five)</h2>
              <p className="text-slate-500 mb-6 text-sm">Классический тест на 120 вопросов, определяющий 5 фундаментальных черт вашей личности.</p>
              <div className="mt-auto inline-flex px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase tracking-wider">
                120 вопросов • 10-15 мин
              </div>
            </button>

            <button 
              onClick={() => setTestType('cattell')}
              className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-lg transition-all text-left flex flex-col items-center text-center group"
            >
              <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Activity className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">16 Факторов Кеттела<br/>(Русский)</h2>
              <p className="text-slate-500 mb-6 text-sm">Глубокий анализ. 187 вопросов для оценки 16 различных аспектов личности.</p>
              <div className="mt-auto inline-flex px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase tracking-wider">
                 187 вопросов • 15-25 мин
              </div>
            </button>

            <button 
              onClick={() => setTestType('cattell_ka')}
              className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-lg transition-all text-left flex flex-col items-center text-center group"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Activity className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">კეტელის 16-ფაქტორიანი ტესტი<br/>(Грузинский)</h2>
              <p className="text-slate-500 mb-6 text-sm">Глубокий анализ. 187 вопросов для оценки 16 различных аспектов личности на грузинском языке.</p>
              <div className="mt-auto inline-flex px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase tracking-wider">
                 187 вопросов • 15-25 мин
              </div>
            </button>
          </div>
        </div>
      </div>
      </div>
    );
  }

  if (testType && !testStarted && !isFinished && !viewedHistoricalResult) {
    const isGeorgian = testType === 'cattell_ka';
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center p-4 w-full">
          <div className="max-w-2xl bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-sm w-full">
            <h2 className="text-3xl font-light text-slate-800 mb-6 text-center">
              {isGeorgian ? 'ტესტის დაწყებამდე' : 'Перед началом теста'}
            </h2>
            <div className="space-y-6 text-slate-600 mb-10">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 font-bold">1</div>
                <p>{isGeorgian ? 'უპასუხეთ სწრაფად, ბევრი არ იფიქროთ. პირველი, რაც თავში მოგივათ, ყველაზე სწორია.' : 'Отвечайте быстро, долго не задумывайтесь. Первое, что приходит в голову — самое верное.'}</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 font-bold">2</div>
                <p>{isGeorgian ? 'მოერიდეთ შუალედურ პასუხებს („არ ვიცი“, „არ ვარ დარწმუნებული“), გამოიყენეთ ისინი მხოლოდ მაშინ, როცა საერთოდ ვერ ირჩევთ სხვა ვარიანტს.' : 'Избегайте промежуточных ответов («не знаю», «не уверен»), используйте их только тогда, когда совсем не можете выбрать другой вариант.'}</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 font-bold">3</div>
                <p>{isGeorgian ? 'უპასუხეთ გულწრფელად. ტესტი აფასებს თქვენს პიროვნულ თვისებებს, აქ არ არის „სწორი“ ან „არასწორი“ პასუხები.' : 'Отвечайте честно. Тест оценивает ваши личные качества, здесь нет «правильных» или «неправильных» ответов.'}</p>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 font-bold">4</div>
                <p>{isGeorgian ? 'მოერიდეთ ისეთ პასუხებს, რომლებიც „სასურველად“ ან „სოციალურად მისაღებად“ გეჩვენებათ.' : 'Избегайте ответов, которые кажутся вам «желанными» или «социально одобряемыми».'}</p>
              </div>
            </div>
            
            <div className="flex md:flex-row flex-col justify-between items-center gap-4">
              <button 
                onClick={() => setTestType(null)}
                className="w-full md:w-auto px-6 py-3 bg-white text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors border border-slate-200"
              >
                {isGeorgian ? 'უკან' : 'Назад к выбору'}
              </button>
              <button 
                onClick={() => setTestStarted(true)}
                className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md"
              >
                {isGeorgian ? 'დაწყება' : 'Понятно, начать'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isFinished || viewedHistoricalResult) {
    const activeTestType = viewedHistoricalResult ? viewedHistoricalResult.testType : testType;
    const currentActiveSummary = activeTestType === 'bigfive' ? bigFiveSummary : activeTestType === 'cattell_ka' ? cattellSummaryKa : cattellSummary;
    const finalScores = viewedHistoricalResult ? viewedHistoricalResult.results : calculateScores();
    const traits = Object.keys(currentActiveSummary) as string[];
    const chartData = traits.map(t => ({
      subject: (currentActiveSummary as any)[t].title,
      You: finalScores[t],
      Partner: partnerData?.results?.[t],
      fullMark: 100
    }));

    let compatibility: number | null = null;
    if (partnerData && partnerData.testType === activeTestType) {
       const diffSum = traits.reduce((sum, t) => sum + Math.abs(finalScores[t] - partnerData.results[t]), 0);
       compatibility = Math.round(100 - (diffSum / traits.length));
    }

    return (
      <div className="bg-slate-50 text-slate-900 min-h-screen flex flex-col font-sans">
        {renderHeader()}
        
        <main className="flex-1 flex flex-col items-center p-4 sm:p-8 lg:p-12 bg-[#F1F5F9] overflow-y-auto">
          <div id="result-report" className="w-full max-w-[1400px] bg-[#F1F5F9] p-4 rounded-xl">

            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4" data-html2canvas-ignore="false">
              <div>
                <h1 className="text-3xl sm:text-4xl font-light text-slate-800 mb-2">{viewedHistoricalResult ? 'Исторический профиль' : 'Ваш психологический профиль'}</h1>
                <p className="text-slate-500">Результаты основаны на оценке {activeTestType === 'bigfive' ? 'Большой Пятерки (Big Five)' : activeTestType === 'cattell_ka' ? 'კეტელის 16-ფაქტორიანი ტესტი (Cattell)' : '16 Факторов Кеттела'}.</p>
              </div>
              <div className="flex flex-col md:flex-row items-end gap-2 md:gap-4" data-html2canvas-ignore="true">
                <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-all">
                  <Download className="w-4 h-4" />
                  Скачать PDF/Image
                </button>
                <button onClick={() => handleAnalyze(finalScores, currentActiveSummary, activeTestType)} disabled={isAnalyzing} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50">
                  <BrainCircuit className="w-4 h-4" />
                  {isAnalyzing ? 'Анализ...' : 'ИИ-Интерпретация'}
                </button>
                {!savedResult ? (
                  <button onClick={() => handleSaveResult(finalScores)} disabled={isSaving} className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 shadow-md transition-all disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Сохранение...' : 'Сохранить профиль'}
                  </button>
                ) : (
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs font-bold text-green-600 flex items-center gap-1"><Check className="w-4 h-4"/> Сохранено</span>
                    {user && (
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                        <span className="text-xs text-slate-500">Ваш ID:</span>
                        <code className="text-xs font-mono font-bold text-indigo-600 select-all">{user.uid}</code>
                        <button onClick={() => navigator.clipboard.writeText(user.uid)} className="text-slate-400 hover:text-indigo-600 ml-1">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Compatibility Section */}
            {(user || savedResult) && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500" /> Сравнить с партнером
                </h3>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <input 
                    type="text" 
                    placeholder="Введите уникальный ID друга..." 
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    value={partnerId}
                    onChange={(e) => setPartnerId(e.target.value)}
                  />
                  <button onClick={handleCompare} disabled={isLoadingPartner || !partnerId} className="px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-all disabled:opacity-50 whitespace-nowrap">
                    {isLoadingPartner ? 'Поиск...' : 'Проверить совместимость'}
                  </button>
                </div>
                {partnerError && <p className="text-rose-500 text-xs mt-2">{partnerError}</p>}
                
                {compatibility !== null && partnerData && (
                  <div className="mt-6 flex flex-col gap-4">
                    <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Базовая совместимость с <span className="font-bold text-indigo-700">{partnerData.displayName}</span></p>
                        <p className="text-xs text-slate-500 mt-1">Основано на математическом сходстве черт личности.</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-3xl font-light text-indigo-700">
                          ~{compatibility}%
                        </div>
                        <button onClick={() => handleCompatibility(finalScores, partnerData.results, currentActiveSummary, activeTestType)} disabled={isAnalyzingCompatibility} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-400 to-rose-500 text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50">
                          <BrainCircuit className="w-4 h-4" />
                          {isAnalyzingCompatibility ? 'Анализ...' : 'Глубокий анализ ИИ'}
                        </button>
                      </div>
                    </div>
                    
                    {aiCompatibility && (
                      <div className="p-6 bg-rose-50 rounded-xl border border-rose-100">
                        <h4 className="font-bold text-rose-800 mb-4 flex items-center gap-2">
                          <BrainCircuit className="w-5 h-5" /> 
                          ИИ-Анализ отношений
                        </h4>
                        <div className="prose prose-sm prose-rose max-w-none prose-headings:font-bold prose-headings:text-rose-900 prose-p:text-slate-700 prose-li:text-slate-700" data-html2canvas-ignore="false">
                          <ReactMarkdown>{aiCompatibility}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col xl:flex-row gap-8">
               <div className="w-full xl:w-2/5 h-[600px] bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 flex flex-col">
                <h4 className="font-bold text-slate-700 mb-4 text-center">Профиль ({activeTestType.toUpperCase()})</h4>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="65%" data={chartData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: activeTestType === 'bigfive' ? 11 : 9, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Radar name="Вы" dataKey="You" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.5} strokeWidth={2} />
                      {partnerData && (
                         <Radar name={partnerData.displayName} dataKey="Partner" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.4} strokeWidth={2} />
                      )}
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`w-full xl:w-3/5 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 ${activeTestType.startsWith('cattell') ? 'md:grid-cols-3' : ''}`}>
                {traits.map(trait => {
                  const perc = finalScores[trait];
                  const meta: any = (currentActiveSummary as any)[trait];
                  return (
                    <div key={trait} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-center mb-2 sm:mb-3">
                        <h3 className="text-sm sm:text-base font-bold text-slate-800">{meta.title}</h3>
                        <span className="text-lg sm:text-xl font-mono text-slate-400 font-light">{perc}%</span>
                      </div>
                      
                      <div className="h-2 w-full bg-slate-100 rounded-full mb-3 sm:mb-4 overflow-hidden">
                        <div className={`h-full ${meta.color} transition-all duration-1000`} style={{ width: `${perc}%` }}></div>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed mb-3 flex-1">
                        {perc > 50 ? meta.high : meta.low}
                      </p>
                      
                      <div className="pt-2 sm:pt-3 border-t border-slate-100 mt-auto text-[9px] sm:text-[10px] text-slate-400 leading-tight">
                        {meta.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {aiAnalysis && (
              <div className="mt-8 p-6 bg-indigo-50 rounded-3xl border border-indigo-100 shadow-sm" data-html2canvas-ignore="false">
                <h3 className="text-xl font-bold text-indigo-900 mb-6 flex items-center gap-3">
                  <BrainCircuit className="w-8 h-8 text-indigo-600" />
                  Ваш ИИ-психологический портрет
                </h3>
                <div className="prose prose-indigo max-w-none prose-headings:font-bold prose-headings:text-indigo-900 prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-indigo-800">
                  <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                </div>
              </div>
            )}
            
            <div className="mt-12 flex justify-center pb-12" data-html2canvas-ignore="true">
              <button 
                onClick={() => window.location.reload()}
                className="px-8 py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
              >
                Вернуться на главную
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-slate-800 p-0 md:p-4 lg:p-8">
      {/* App Container mimicking the design's bounded canvas but responsive */}
      <div className="bg-slate-50 text-slate-900 w-full max-w-[1280px] min-h-[100dvh] md:min-h-0 md:h-[800px] flex flex-col md:rounded-2xl overflow-hidden shadow-2xl font-sans relative">
        
        {renderHeader()}

        {/* Progress Indicator */}
        <div className="w-full bg-slate-200 h-1.5 flex-shrink-0">
          <div className="bg-indigo-600 h-full transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }}></div>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 flex overflow-hidden flex-col lg:flex-row position-relative">
          
          {/* Left Sidebar: Trait Definitions */}
          <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-4 lg:p-6 flex flex-col gap-4 lg:gap-6 overflow-y-auto hidden md:flex flex-shrink-0 hide-scrollbar">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Шкалы оценки</h3>
              <ul className="space-y-4">
                {(Object.keys(activeSummary) as string[]).map(traitKey => {
                  const trait: any = activeSummary[traitKey as keyof typeof activeSummary];
                  const isActive = currentQuestion?.trait === traitKey;
                  return (
                    <li key={traitKey} className={`flex gap-3 transition-opacity ${isActive ? 'opacity-100' : 'opacity-40'} ${testType?.startsWith('cattell') ? 'mb-2' : ''}`}>
                      <div className={`w-1 h-auto min-h-[20px] ${trait.color} rounded-full`}></div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">{trait.title}</div>
                        {testType === 'bigfive' && <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{trait.desc}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          {/* Question Interface */}
          <section className="flex-1 flex flex-col items-center p-4 py-8 lg:p-12 bg-[#F1F5F9] overflow-y-auto relative min-h-[450px]">
            <div className="w-full max-w-2xl mt-auto mb-auto flex flex-col relative h-full justify-center pb-8 sm:pb-0">
              <div className="text-slate-400 text-sm font-medium mb-3 uppercase tracking-wide">Утверждение {currentIndex + 1} из {activeQuestions.length}</div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-light text-slate-800 leading-snug lg:leading-snug mb-16 lg:mb-24 min-h-[80px] sm:min-h-[120px]">
                «{currentQuestion?.text}»
              </h2>

              {/* Likert Scale */}
              <div className={`grid gap-1 sm:gap-4 xl:gap-6 relative px-1 sm:px-4 w-full`} style={{ gridTemplateColumns: `repeat(${likertOptions.length}, minmax(0, 1fr))` }}>
                {/* Connection Line */}
                <div className="absolute top-5 sm:top-6 left-[10%] right-[10%] h-px bg-slate-300 -z-10"></div>
                
                {likertOptions.map((opt) => {
                  const isSelected = currentAnswer === opt.value;
                  return (
                    <div 
                      key={opt.value} 
                      className="flex flex-col items-center gap-2 sm:gap-4 group cursor-pointer"
                      onClick={() => handleAnswer(opt.value)}
                    >
                      <button 
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-200 flex items-center justify-center
                        ${isSelected 
                          ? 'border-4 border-indigo-600 bg-indigo-50 shadow-lg shadow-indigo-200 scale-110' 
                          : 'border-2 border-slate-300 bg-white group-hover:border-indigo-400 group-hover:bg-slate-50'
                        }`}
                      >
                        {isSelected && <Check className="w-5 h-5 text-indigo-600" />}
                      </button>
                      <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-tighter text-center leading-tight transition-colors px-0.5 mt-1
                        ${isSelected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                        {opt.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Right Sidebar: Stats/Info */}
          <aside className="w-full lg:w-64 bg-slate-50 border-t lg:border-t-0 lg:border-l border-slate-200 p-4 lg:p-6 flex flex-col gap-6 lg:gap-8 hidden lg:flex flex-shrink-0 z-10 hide-scrollbar overflow-y-auto">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-wider">Предварительно</h4>
              <div className="space-y-3">
                {(Object.keys(estimatedScores) as string[]).map(traitKey => {
                  const score = estimatedScores[traitKey];
                  const meta: any = activeSummary[traitKey as keyof typeof activeSummary];
                  const isActive = Object.keys(answers).length > 0;
                  
                  return (
                    <div key={traitKey} className={`transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-30'}`}>
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-[10px] font-medium text-slate-700" title={meta.title}>
                          {testType?.startsWith('cattell') ? traitKey : meta.title}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{score}%</span>
                      </div>
                      <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className={`${meta.color} h-full transition-all duration-700`} style={{ width: `${score}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </main>

        {/* Footer Action Bar */}
        <footer className="bg-white border-t border-slate-200 p-3 sm:p-4 px-4 sm:px-8 flex items-center justify-between flex-shrink-0 z-10 w-full">
          <button 
            onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-semibold transition-colors
              ${currentIndex === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Предыдущее</span>
            <span className="sm:hidden">Назад</span>
          </button>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-xs font-medium text-slate-400 sm:hidden block px-2">{currentIndex + 1} / {activeQuestions.length}</span>
            <button 
              onClick={() => {
                if (currentIndex < activeQuestions.length - 1) {
                  setCurrentIndex(curr => Math.min(curr + 1, activeQuestions.length - 1));
                } else {
                  setIsFinished(true);
                }
              }}
              className="px-3 py-2 border border-slate-300 text-slate-600 rounded text-xs sm:text-sm font-bold hover:bg-slate-50 transition-colors hidden sm:block"
            >
              Пропустить
            </button>
            <button 
              onClick={() => {
                if (currentIndex < activeQuestions.length - 1) {
                  setCurrentIndex(curr => Math.min(curr + 1, activeQuestions.length - 1));
                } else {
                  setIsFinished(true);
                }
              }}
              disabled={currentAnswer === undefined && currentIndex === activeQuestions.length - 1}
              className={`px-4 sm:px-6 md:px-8 py-2 md:py-2.5 rounded text-xs sm:text-sm font-bold shadow-lg transition-all flex items-center gap-1 sm:gap-2 whitespace-nowrap
                ${currentAnswer !== undefined || currentIndex < activeQuestions.length - 1
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}
            >
              <span className="hidden sm:inline">Следующее</span>
              <span className="sm:hidden">Далее</span>
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 sm:hidden" />
            </button>
          </div>
        </footer>
      </div>
      
      {/* Global CSS fixes for scrollbars in this particular theme */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
