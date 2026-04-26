export const program = {
  help: () => {
    console.log('\nclicord - Terminal Discord Client\n');
    console.log('Usage: clicord <command>\n');
    console.log('Commands:');
    console.log('  clicord tui        Start unified Discord interface (DMs and Servers)');
    console.log('  clicord dm         Start standalone Direct Messages interface');
    console.log('  clicord server     Start standalone Server browser interface');
    console.log('  clicord help       Show this help message');
    console.log('  clicord -h         Show this help message\n');
  }
};

