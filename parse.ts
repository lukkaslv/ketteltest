import fs from 'fs';

const html = fs.readFileSync('psylab.html', 'utf-8');

const tables = html.split('<table').map(t => t.split('</table>')[0]);
const factorMap: any = {
    'А': 'A', 'A': 'A', 'B': 'B', 'C': 'C', 'В': 'B', 'С': 'C', 'Е': 'E', 'E': 'E', 'F': 'F', 'G': 'G', 'H': 'H', 'I': 'I', 'L': 'L', 'M': 'M', 'N': 'N', 'O': 'O', 'Q1': 'Q1', 'Q2': 'Q2', 'Q3': 'Q3', 'Q4': 'Q4'
};
const keys: any[] = [];

tables.forEach((t, i) => {
    if (t.includes('Фактор')) {
        const rows = t.split('<tr').slice(1).map(r => r.split('</tr>')[0]);
        rows.forEach(r => {
            const cells = r.split(/<t[hd]/).slice(1).map(c => c.split(/<\/t[hd]>/)[0].replace(/.*?>/g, '').trim());
            // It could be that 'Фактор' itself is a cell
            if (cells.length > 0) {
              const factorName = cells[0].replace(/<[^>]+>/g, '').trim();
              const mappedFactor = factorMap[factorName] || factorMap[factorName.toUpperCase()];
              
              if (mappedFactor) {
                // The cells have format like "3 ab", so we can join them
                const restCells = r.replace(/<[^>]+>/g, ' '); 
                const items = restCells.split(/\s+/).filter(x => x.length > 0);
                
                // console.log("Checking line:", items.join(' '));
                
                // The array is like [ 'А', '3', 'ab', '|', '26', 'bc' ] .. wait, let's just parse numbers and strings contiguous, or just regex the whole row string
                const rowText = items.join(' ');
                // console.log(rowText);
                const matches = [...rowText.matchAll(/(\d+)\s+(ab|bc|a|b|c)/gi)];
                
                matches.forEach(match => {
                    const qNum = parseInt(match[1]);
                    const keyType = match[2].toLowerCase();
                    
                    let a = 0, b = 0, c = 0;
                    if (mappedFactor === 'B') {
                      if (keyType === 'a') { a = 1; }
                      if (keyType === 'b') { b = 1; }
                      if (keyType === 'c') { c = 1; }
                    } else {
                      if (keyType === 'ab') { a = 2; b = 1; c = 0; }
                      if (keyType === 'bc') { a = 0; b = 1; c = 2; }
                    }
                    keys.push({ id: qNum, trait: mappedFactor, a, b, c });
                });
              }
            }
        });
    }
});

keys.sort((x, y) => x.id - y.id);
fs.writeFileSync('keys.json', JSON.stringify(keys, null, 2));
console.log('Keys extracted: ', keys.length);
