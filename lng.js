const { v4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const files = [
    'zh_CN.json',
    'en_US.json'
].map(file => path.join(__dirname, `./languages/${file}`));

function createTextCode() {
    const hash = crypto.createHash('sha256').update(v4()).digest('hex');
    const id = hash.slice(0,8);

    return `TEXT_CODE_${id}`;
}

function formatJson(json) {
    return JSON.stringify(json, null, 2);
}

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 提问并处理输入
rl.question('中文：', (zh) => {
    rl.question('英文：', (en) => {
        const code = createTextCode();
        fs.writeFileSync(files[0], formatJson(Object.assign(JSON.parse(fs.readFileSync(files[0], 'utf-8')),{ [code]: zh })));
        fs.writeFileSync(files[1], formatJson(Object.assign(JSON.parse(fs.readFileSync(files[1], 'utf-8')),{ [code]: en })));

        console.log('\n使用 ->\n\n' + code);
        rl.close();
    })
});