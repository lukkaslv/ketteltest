import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('psylab_q.html', 'utf-8');
const dom = new JSDOM(html);
const ols = dom.window.document.querySelectorAll('ol');
let allLi = [];
ols.forEach(ol => {
    ol.querySelectorAll(':scope > li').forEach(li => {
        allLi.push(li);
    });
});

let questions = [];
let id = 1;
allLi.forEach(li => {
   let fullText = li.textContent.trim();
   // remove the 'a)', 'b)', 'c)' part
   let optionsTextIndex = fullText.search(/[a-cа-с]\)/i);
   let qText = fullText;
   if (optionsTextIndex > 0) {
       qText = fullText.substring(0, optionsTextIndex).trim();
   }
   
   let uls = li.querySelectorAll('ul li');
   let options = Array.from(uls).map(l => l.textContent.trim().replace(/^[a-cа-с]\)\s*/i, '').replace(/;|\.$/, ''));
   if (options.length >= 3) {
      questions.push({ id, text: qText, a: options[0], b: options[1], c: options[2] });
   } else if (options.length === 0) {
      let parts = li.innerHTML.replace(/<br\s*\/?>/g, '|').replace(/<[^>]+>/g, '').split('|').map(x => x.trim()).filter(x => x);
      if (parts.length >= 4) {
          questions.push({
             id, 
             text: parts[0], 
             a: parts[1].replace(/^[a-cа-с]\)\s*/i, '').replace(/;|\.$/, ''),
             b: parts[2].replace(/^[a-cа-с]\)\s*/i, '').replace(/;|\.$/, ''),
             c: parts[3].replace(/^[a-cа-с]\)\s*/i, '').replace(/;|\.$/, '')
          });
      }
   }
   id++;
});

fs.writeFileSync('questions.json', JSON.stringify(questions, null, 2));
console.log('Parsed:', questions.length);
