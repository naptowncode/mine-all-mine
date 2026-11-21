'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function loadScripts(files, bindingNames, extraGlobals) {
  const names = bindingNames || [];
  const source = files
    .map((file) => {
      const filePath = path.resolve(PROJECT_ROOT, file);
      return `// ${file}\n${fs.readFileSync(filePath, 'utf8')}`;
    })
    .join('\n;\n');

  const exportExpression = `;({ ${names.join(', ')} })`;
  const context = vm.createContext({ console, ...(extraGlobals || {}) });

  return vm.runInContext(source + exportExpression, context, {
    filename: files.join(' + ')
  });
}

module.exports = { loadScripts };
