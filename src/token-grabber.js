import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import https from 'https';
import blessed from 'blessed';
import chalk from 'chalk';
import dotenv from 'dotenv';

function decryptMasterKey(encryptedKeyBase64) {
    const buffer = Buffer.from(encryptedKeyBase64, 'base64');
    const encryptedKey = buffer.slice(5).toString('base64');
    
    const psScript = `
        \$code = @"
        using System;
        using System.Security.Cryptography;
        public class DPAPI {
            public static string Decrypt(string b64) {
                byte[] data = Convert.FromBase64String(b64);
                byte[] raw = ProtectedData.Unprotect(data, null, DataProtectionScope.CurrentUser);
                return Convert.ToBase64String(raw);
            }
        }
"@
        Add-Type -TypeDefinition \$code -Language CSharp -ReferencedAssemblies "System.Security"
        [DPAPI]::Decrypt("${encryptedKey}")
    `;
    
    const output = execSync('powershell -NoProfile -NonInteractive -Command -', { input: psScript, encoding: 'utf8' }).trim();
    return Buffer.from(output, 'base64');
}

function extractTokens() {
    if (process.platform !== 'win32') return [];
    
    const paths = ['Discord', 'discordcanary', 'discordptb', 'discorddevelopment'].map(p => path.join(process.env.APPDATA, p));
    const allTokens = [];

    for (const dir of paths) {
        if (!fs.existsSync(dir)) continue;
        const localStatePath = path.join(dir, 'Local State');
        if (!fs.existsSync(localStatePath)) continue;
        
        let localState;
        try {
            localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
        } catch(e) { continue; }
        
        if (!localState.os_crypt || !localState.os_crypt.encrypted_key) continue;
        
        let masterKey;
        try {
            masterKey = decryptMasterKey(localState.os_crypt.encrypted_key);
        } catch(e) { continue; }
        
        const leveldbPath = path.join(dir, 'Local Storage', 'leveldb');
        if (!fs.existsSync(leveldbPath)) continue;
        
        for (const file of fs.readdirSync(leveldbPath)) {
            if (!file.endsWith('.log') && !file.endsWith('.ldb')) continue;
            let content;
            try {
                content = fs.readFileSync(path.join(leveldbPath, file), 'utf8');
            } catch(e) { continue; }
            
            const matches = content.match(/dQw4w9WgXcQ:[^\"\'\\]+/g);
            if (!matches) continue;
            
            for (const match of matches) {
                try {
                    const encryptedToken = Buffer.from(match.split(':')[1], 'base64');
                    const iv = encryptedToken.slice(3, 15);
                    const ciphertext = encryptedToken.slice(15, encryptedToken.length - 16);
                    const authTag = encryptedToken.slice(encryptedToken.length - 16);
                    
                    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
                    decipher.setAuthTag(authTag);
                    const decrypted = decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
                    allTokens.push(decrypted);
                } catch(e) { }
            }
        }
    }
    
    return [...new Set(allTokens)];
}

function fetchUser(token) {
    return new Promise((resolve) => {
        const req = https.get('https://discord.com/api/v9/users/@me', {
            headers: { 'Authorization': token }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
                } else {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

async function getValidAccounts() {
    const tokens = extractTokens();
    const accounts = [];
    
    for (const token of tokens) {
        const user = await fetchUser(token);
        if (user) {
            accounts.push({ token, username: user.username, discriminator: user.discriminator, globalName: user.global_name });
        }
    }
    return accounts;
}

function promptAccountSelection(accounts) {
    return new Promise((resolve) => {
        const screen = blessed.screen({
            smartCSR: true,
            title: 'clicord - select account'
        });

        const box = blessed.box({
            top: 'center',
            left: 'center',
            width: 50,
            height: accounts.length + 6,
            border: { type: 'line', fg: 'cyan' },
            style: { bg: 'black', fg: 'white' }
        });
        
        blessed.text({
            parent: box,
            top: 0,
            left: 'center',
            content: '{bold}Select Discord Account{/bold}',
            tags: true,
            style: { fg: 'yellow' }
        });
        
        blessed.text({
            parent: box,
            top: 1,
            left: 'center',
            content: 'Use UP/DOWN arrows and ENTER',
            style: { fg: 'grey' }
        });

        const list = blessed.list({
            parent: box,
            top: 3,
            left: 2,
            right: 2,
            height: accounts.length,
            keys: true,
            vi: true,
            mouse: true,
            style: {
                item: { fg: 'white' },
                selected: { fg: 'black', bg: 'cyan', bold: true }
            },
            items: accounts.map(acc => {
                const name = acc.globalName ? `${acc.globalName} (@${acc.username})` : `${acc.username}#${acc.discriminator}`;
                return ` ${name} `;
            })
        });

        screen.append(box);
        list.focus();
        screen.render();

        list.on('select', (item, index) => {
            screen.destroy();
            resolve(accounts[index].token);
        });

        screen.key(['escape', 'q', 'C-c'], () => {
            screen.destroy();
            console.log(chalk.red('Account selection cancelled.'));
            process.exit(0);
        });
    });
}

async function getTokenInteractive() {
    console.log(chalk.cyan('Scanning for Discord accounts...'));
    const accounts = await getValidAccounts();
    
    if (accounts.length === 0) {
        console.error(chalk.red('HATA: Hiçbir Discord hesabı bulunamadı!'));
        console.log(chalk.yellow('Lütfen bilgisayarınızdaki Discord uygulamalarından (Stable, Canary, PTB) birine giriş yapın.'));
        process.exit(1);
    }
    
    if (accounts.length === 1) {
        return accounts[0].token;
    }
    
    return await promptAccountSelection(accounts);
}

export { getTokenInteractive };
