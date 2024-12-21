import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Функция для чтения файла и получения массива слов
function readWordsFromFile(filePath: string): Promise<string[]> {
    const words: string[] = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    rl.on('line', (line) => {
        words.push(line.trim());
    });

    return new Promise((resolve) => {
        rl.on('close', () => resolve(words));
    });
}

// Функция для генерации случайной мнемонической фразы
export async function generateMnemonicPhrase(filePath: string, phraseLength: number = 12): Promise<string> {
    const words = await readWordsFromFile(filePath);
    const mnemonic: string[] = [];

    for (let i = 0; i < phraseLength; i++) {
        const randomIndex = Math.floor(Math.random() * words.length);
        mnemonic.push(words[randomIndex]);
    }

    return mnemonic.join(' ');
}
