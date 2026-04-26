#!/usr/bin/env node

import { program } from './src/cli.js';
import { startChat } from './src/dm.js';
import { startServer } from './src/server.js';
import { startTUI } from './src/tui.js';
import { showLogo } from './src/logo.js';
import chalk from 'chalk';

// Global exit handler to restore terminal cursor
process.on('exit', () => {
  process.stdout.write('\x1b[?25h');
});

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
  showLogo();
  console.log(chalk.white(`\n${randomQuote}`));
  console.log(chalk.white("\nUsage: clicord <command>\n"));
  console.log(chalk.cyan("  tui") + chalk.white("      Discord TUI interface"));
  console.log(chalk.cyan("  dm") + chalk.white("       Direct messages"));
  console.log(chalk.cyan("  server") + chalk.white("   Server browser"));
  console.log(chalk.cyan("  help") + chalk.white("     Show help\n"));
  process.exit(0);
} else if (args[0] === 'tui') {
  startTUI();
} else if (args[0] === 'dm') {
  startChat();
} else if (args[0] === 'server') {
  startServer();
} else if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
  program.help();
} else {
  console.log(chalk.red(`Unknown command: ${args[0]}`));
  program.help();
}
