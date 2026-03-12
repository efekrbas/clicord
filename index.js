#!/usr/bin/env node

import { program } from './src/cli.js';
import { startChat } from './src/dm.js';
import { startServer } from './src/server.js';
import { showLogo } from './src/logo.js';
import chalk from 'chalk';

// Ana CLI programı
const args = process.argv.slice(2);

if (args.length === 0) {
  const quotes = [
    "Discord, stripped of the bloat.",
    "No nitro, no stickers, just messages.",
    "The quietest way to use Discord.",
    "Read the chat. Ignore the noise.",
    "Your Discord, terminal-fied.",
    "Discord at the speed of thought.",
    "All your servers, one terminal away.",
    "Bye bye Electron. Hello performance.",
    "Focus on the text. Forget the icons.",
    "Discord: Keyboard-only edition.",
    "Navigate your servers like a pro.",
    "Piping Discord directly to your TTY."
  ];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  // Logo ve hoş geldin mesajı göster
  showLogo();
  console.log(chalk.white(`\n${randomQuote}`));
  console.log(chalk.white("Type 'npm run help' to see available commands."));
  console.log(chalk.white("Pro Tip: Use vim-motion ('k', 'j') to navigate chats and messages."));
  process.exit(0);
}

if (args[0] === 'dm') {
  startChat();
} else if (args[0] === 'server') {
  startServer();
} else if (args[0] === '--help' || args[0] === '-h') {
  program.help();
} else {
  program.parse(process.argv);
}
