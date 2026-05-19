import fs from 'fs';

function fixFile(file: string) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/нечто среднее между#\* a\) и/g, "нечто среднее");
    content = content.replace(/среднее между#\* a\) и/g, "верно нечто среднее");
    content = content.replace(/რაღაც საშუალო #\* a\) და/g, "საშუალო ვარიანტია");
    content = content.replace(/საშუალო #\* a\) და/g, "საშუალო ვარიანტია");
    
    // There appears to be a case for (даже если при этом нет лица другого пол#*
    content = content.replace(/пол#\*/g, "пола)");
    content = content.replace(/სქესის პირი არ იყოს #\*/g, "სქესის პირი არ იყოს)");
    
    fs.writeFileSync(file, content);
}

fixFile('src/cattellData.ts');
fixFile('src/cattellDataKa.ts');

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');
appTsx = appTsx.replace('q.sign > 0', '(q as any).sign > 0');
fs.writeFileSync('src/App.tsx', appTsx);

// Delete parse_q.ts
if (fs.existsSync('parse_q.ts')) fs.unlinkSync('parse_q.ts');
if (fs.existsSync('parse.ts')) fs.unlinkSync('parse.ts');
console.log('Fixed stuff');
