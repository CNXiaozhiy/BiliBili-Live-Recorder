const { v4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const num = 1000;

const lang_json_file = path.join(__dirname, './languages/file_name.json');

const lang_json_obj = {};
let lang_json = '';

for (let i = 0; i < num; i++) {
    const hash = crypto.createHash('sha256').update(v4()).digest('hex');
    const id = hash.slice(0,8);
    
    lang_json_obj[`TEXT_CODE_${id}`] = 'xxx';
}

// 格式化 JSON

lang_json = JSON.stringify(lang_json_obj);
lang_json = lang_json.replace(/{/g, '{\n');
lang_json = lang_json.replace(/,/g, ',\n');
lang_json = lang_json.replace(/}/g, '\n}');

fs.writeFileSync(lang_json_file, lang_json);

console.log(`[IL] 生成 ${num} 个 IL`);