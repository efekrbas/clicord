import blessed from 'blessed';
import { Client } from 'discord.js-selfbot-v13';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { openFileInBrowser } from './utils.js';

dotenv.config();

let client = null;
let currentChannel = null;
let currentGuild = null;
let guilds = [];
let channels = [];
let messages = [];
let messageMap = new Map();
let messageFiles = new Map(); // Stores file URLs for all attachments (images and files)
let deletedMessageIds = new Set();
let sentMessageIds = new Set();
let selectedIndex = 0;
let mode = 'guilds'; // 'guilds', 'channels', 'chat'
let replyToMessageId = null;
let channelLastReadMessage = new Map();

// Fix blessed emoji/wide-char width calculation - adds space after wide characters
function safeEmoji(text) {
  if (!text) return '';
  return text.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{3000}-\u{303F}\u{30A0}-\u{30FF}\u{FF01}-\u{FF60}\u{2300}-\u{23FF}])/gu, '$1 ');
}

export async function startServer(selectedToken = null) {
  console.log(chalk.cyan('\nStarting Discord Server Browser...\n'));

  const token = selectedToken || process.env.DISCORD_USER_TOKEN;
  if (!token) {
    console.error(chalk.red('HATA: DISCORD_USER_TOKEN environment variable bulunamadı!'));
    console.log(chalk.yellow('\nLütfen .env dosyası oluşturup DISCORD_USER_TOKEN değerini ekleyin.'));
    process.exit(1);
  }

  client = new Client({
    checkUpdate: false,
    ws: {
      properties: {
        browser: "Discord Client"
      }
    },
    intents: []
  });

  const screen = blessed.screen({
    smartCSR: true,
    title: 'clicord',
    fullUnicode: true,
    forceUnicode: true
  });


  const container = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: {
      bg: 'black'
    }
  });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: 'clicord (• Live) / Server Browser',
    tags: true,
    style: {
      bg: 'black',
      fg: 'white',
      bold: true
    }
  });



  const list = blessed.list({
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-3',
    keys: false,
    vi: false,
    mouse: true,
    tags: true,
    invertSelected: false,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      inverse: true
    },
    style: {
      bg: 'black',
      selected: {
        bg: 'black',
        fg: 'white'
      },
      item: {
        bg: 'black',
        fg: 'white'
      }
    }
  });


  const messageList = blessed.box({
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-9',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      inverse: true
    },
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    style: {
      bg: 'black',
      fg: 'white'
    }
  });

  const input = blessed.textarea({
    bottom: 3,
    left: 0,
    width: '100%',
    height: 3,
    inputOnFocus: true,
    keys: true,
    style: {
      bg: 'black',
      fg: 'white',
      focus: {
        bg: 'blue',
        fg: 'white'
      }
    }
  });

  // Enter key submits instead of adding newline
  input.key('enter', () => {
    const value = input.getValue().replace(/\n/g, '');
    input.emit('submit', value);
  });

  // Hide cursor by default, show only when input has focus
  screen.program.write('\x1b[?25l');
  input.on('focus', () => { screen.program.write('\x1b[?25h'); });
  input.on('blur', () => { screen.program.write('\x1b[?25l'); });

  const helpText = blessed.text({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: 'j/k: navigate, Enter: select, Esc: back/quit',
    style: {
      bg: 'black',
      fg: 'grey'
    }
  });

  screen.append(container);
  container.append(header);
  container.append(list);
  container.append(messageList);
  container.append(input);
  container.append(helpText);

  function switchMode(newMode) {
    // Hide everything first
    list.hide();
    messageList.hide();
    input.hide();


    // Generalized Cleanup: Always wipe list and chat content before switching
    // This ensures no artifacts remain from the previous view
    messageList.setContent('');
    list.setItems([]);

    // Force a render to physically clear the screen of these elements
    // This is safer than screen.clear() as it uses blessed's internal logic
    screen.render();

    mode = newMode;
    if (mode === 'guilds') {
      // Clear content to prevent rendering artifacts
      messageList.setContent('');
      messageList.setScrollPerc(0);
      input.setValue('');

      header.setContent('clicord (• Live) / Server Browser');

      list.show();
      list.setFront(); // Ensure list is on top
      list.focus();
      helpText.setContent('j/k: navigate, Enter: select, Esc: quit');
    } else if (mode === 'channels') {
      // Clear content to prevent rendering artifacts
      messageList.setContent('');
      messageList.setScrollPerc(0);
      input.setValue('');

      header.setContent(
        `clicord (• Live) / Server Browser | ${currentGuild ? currentGuild.name : 'Unknown'
        }${currentChannel ? ` > ${currentChannel.name}` : ''}`
      );

      list.show();
      list.setFront(); // Ensure list is on top
      list.focus();
      helpText.setContent('j/k: navigate, Enter: select, Esc: back');
    } else if (mode === 'chat') {
      list.hide();
      messageList.show();
      messageList.setFront(); // Ensure chat is on top
      input.show();
      input.setFront(); // Ensure input is on top
      input.focus();
      helpText.setContent('Esc: back, Ctrl+D: clear input, /upload <path>: upload file, /view <id>: open file, /reply <id> <msg>: reply, /edit <id> <msg>: edit, /delete <id>: delete, /help: commands');
    }
    screen.render();
  }

  function formatMessageContent(message) {
    let content = message.content || '';

    // Handle System Messages
    // Note: discord.js-selfbot-v13 usually returns types as strings
    switch (message.type) {
      case 'GUILD_MEMBER_JOIN':
        return '{green-fg}→ Sunucuya katıldı.{/green-fg}';
      case 'USER_PREMIUM_GUILD_SUBSCRIPTION':
      case 'USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_1':
      case 'USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_2':
      case 'USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_3':
        return '{magenta-fg}★ Sunucuya takviye yaptı!{/magenta-fg}';
      case 'CHANNEL_PINNED_MESSAGE':
        return '{white-fg}📌 Bir mesaj sabitledi.{/white-fg}';
      case 'CALL':
        return '{cyan-fg}📞 Bir arama başlattı.{/cyan-fg}';
      case 'CHANNEL_NAME_CHANGE':
        return '{white-fg}✏️ Kanal adını değiştirdi.{/white-fg}';
      case 'RECIPIENT_ADD':
        return '{green-fg}→ Gruba birini ekledi.{/green-fg}';
      case 'RECIPIENT_REMOVE':
        return '{red-fg}← Gruptan birini çıkardı.{/red-fg}';
    }

    // Clean user content first (escapes braces, preserves mentions)
    content = cleanMessageContent(content);

    // Resolve User Mentions (<@ID> or <@!ID>)
    content = content.replace(/<@!?(\d+)>/g, (match, id) => {
      const user = client.users.cache.get(id);
      const member = currentGuild ? currentGuild.members.cache.get(id) : null;
      const name = member ? member.displayName : (user ? user.username : 'Unknown User');
      return `@{cyan-fg}${name}{/cyan-fg}`;
    });

    // Resolve Channel Mentions (<#ID>)
    content = content.replace(/<#(\d+)>/g, (match, id) => {
      const channel = currentGuild ? currentGuild.channels.cache.get(id) : null;
      const chStruct = channel || client.channels.cache.get(id);
      const name = chStruct ? chStruct.name : 'deleted-channel';
      return `#{blue-fg}${name}{/blue-fg}`;
    });

    // Resolve Role Mentions (<@&ID>)
    content = content.replace(/<@&(\d+)>/g, (match, id) => {
      const role = currentGuild ? currentGuild.roles.cache.get(id) : null;
      const name = role ? role.name : 'deleted-role';
      return `@{magenta-fg}${name}{/magenta-fg}`;
    });

    // Resolve Custom Emojis (<:name:ID>)
    content = content.replace(/<:(\w+):(\d+)>/g, (match, name, id) => {
      return `:${name}:`;
    });

    // Resolve Animated Emojis (<a:name:ID>)
    content = content.replace(/<a:(\w+):(\d+)>/g, (match, name, id) => {
      return `:${name}:`;
    });

    // Handle Interactions (Slash Commands)
    if (message.interaction) {
      content = `{cyan-fg}Used /${message.interaction.commandName}{/cyan-fg}\n` + content;
    }

    // Handle Stickers
    if (message.stickers && message.stickers.size > 0) {
      const sticker = message.stickers.first();
      content += `\n{blue-fg}[Sticker: ${sticker.name}]{/blue-fg}`;
    }

    // Handle Embeds with better formatting
    if (message.embeds && message.embeds.length > 0) {
      for (const embed of message.embeds) {
        if (embed.title) {
          content += (content ? '\n' : '') + `{yellow-fg}${cleanMessageContent(embed.title)}{/yellow-fg}`;
        }
        if (embed.description) {
          content += (content ? '\n' : '') + cleanMessageContent(embed.description);
        }
        if (embed.fields && embed.fields.length > 0) {
          for (const field of embed.fields) {
            content += (content ? '\n' : '') + `{cyan-fg}${cleanMessageContent(field.name)}:{/cyan-fg} `;
            content += cleanMessageContent(field.value);
          }
        }
        if (embed.footer && embed.footer.text) {
          content += (content ? '\n' : '') + `{white-fg}${cleanMessageContent(embed.footer.text)}{/white-fg}`;
        }
      }
    }

    return content;
  }

  function cleanMessageContent(text) {
    if (!text) return '';

    // First, strip HTML tags and extract only text content
    let cleaned = text
      .replace(/<[^>]*>/g, '') // Remove all HTML tags
      .replace(/&lt;/g, '<') // Unescape HTML entities
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // Remove markdown formatting and Discord-specific formatting
    // We want to keep SOME formatting now for embeds/system messages if we added colors manually
    // So we match standard markdown but ignore {color-fg} tags we just added

    // Simple approach: Render functions added {color-fg} tags. 
    // cleanMessageContent strips markdown. 
    // We need to be careful not to strip the tags we just added.
    // The current cleanMessageContent doesn't strip {tags}, only specific markdown like ** **.
    // However, it does this: cleaned = cleaned.replace(/[\x00-\x08...]/g, ''); which is fine.

    // Let's refine the specific markdown replacements to avoid breaking our new look, 
    // but the previous regexes look mostly safe for {tags}. 

    cleaned = cleaned
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold **text**
      .replace(/\*(.*?)\*/g, '$1') // Remove italic *text*
      .replace(/__(.*?)__/g, '$1') // Remove underline __text__
      .replace(/~~(.*?)~~/g, '$1') // Remove strikethrough ~~text~~
      .replace(/`([^`]*)`/g, '$1') // Remove inline code `code`
      // .replace(/```[\s\S]*?```/g, '[Code Block]') // Keep code blocks content? -> previous logic replaced it.
      // Let's keep the replacement for now to safe space.
      .replace(/```[\s\S]*?```/g, '[Code Block]')
      .replace(/^> /gm, '') // Remove quote markers
      .replace(/^#{1,6} /gm, '') // Remove heading markers
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Remove markdown links
    // .replace(/<@!?\d+>/g, '') // Remove user mentions
    // .replace(/<#\d+>/g, '') // Remove channel mentions
    // .replace(/<@&\d+>/g, '') // Remove role mentions
    // .replace(/<:[^:]+:\d+>/g, '') // Remove custom emoji
    // .replace(/<a:[^:]+:\d+>/g, '') // Remove animated emoji
    // .replace(/<@!?&?\d+>/g, ''); // Remove any remaining mentions

    // Escape brace characters to prevent blessed style bleeding from USER input
    cleaned = cleaned.replace(/\{/g, '\\{').replace(/\}/g, '\\}');

    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');

    return cleaned.trim();
  }

  function renderAllMessages() {
    try {
      // Safety: If messageList is hidden and we are not forcing a load (hard to check), abort?
      // But switchMode logic handles setFront to mask issues.

      let content = '';
      for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });

        let messageContent = '';
        if (msg.isImage) {
          const fileUrl = messageFiles.get(msg.messageId);
          if (msg.fileName) {
            messageContent = `{blue-fg}[File: {/blue-fg}{yellow-fg}${msg.fileName}{/yellow-fg}{blue-fg}]{/blue-fg}`;
          } else if (fileUrl && msg.messageId) {
            messageContent = `{blue-fg}[Image]{/blue-fg}`;
          } else {
            messageContent = `{blue-fg}[File]{/blue-fg}`;
          }
        } else {
          // Content is already formatted/cleaned by formatMessageContent
          messageContent = msg.content || '{white-fg}(empty message){/white-fg}';
        }

        if (msg.messageId && deletedMessageIds.has(msg.messageId)) {
          messageContent += ` {red-fg}[message deleted]{/red-fg}`;
        }

        let replyInfo = '';
        if (msg.replyTo) {
          const repliedMsg = messageMap.get(msg.replyTo);
          if (repliedMsg) {
            // repliedMsg.content is already formatted
            // Strip tags for preview consistency or keep them?
            // Simple substring might cut a tag in half.
            // Let's strip tags for the preview part just to be safe.
            const plainContent = repliedMsg.content.replace(/\{.*?\}/g, '');
            const replyContent = plainContent.substring(0, 30);
            replyInfo = `{yellow-fg}↪ Replying to ${repliedMsg.username}: ${replyContent}${plainContent.length >= 30 ? '...' : ''}{/yellow-fg}\n`;
          }
        }

        const isSystemMessage = msg.username === 'System';
        const prefix = isSystemMessage ? '{red-fg}System{/red-fg}' : (msg.isOwn ? '{green-fg}You{/green-fg}' : `{cyan-fg}${msg.username}{/cyan-fg}`);
        const idInfo = (msg.messageId && !isSystemMessage) ? ` {blue-fg}({/blue-fg}{yellow-fg}${msg.messageId}{/yellow-fg}{blue-fg}){/blue-fg}` : '';

        // Added {/} at end to reset any leaking colors
        content += `${replyInfo}${prefix} [${time}]\n${messageContent}${idInfo}{/}\n\n`;
      }

      messageList.setContent(content);
      messageList.setScrollPerc(100);

      // Only render if messagelist is visible or we are forcing an update
      if (!messageList.hidden) {
        screen.render();
      }
    } catch (error) {
      console.error('renderAllMessages error:', error);
    }
  }

  function addMessage(username, content, timestamp, isImage = false, isOwn = false, messageId = null, replyTo = null, imageUrl = null, fileName = null, shouldRender = true) {
    try {
      const msgObj = { username, content: content || '', timestamp, isImage, isOwn, messageId, replyTo, fileName };

      if (messageId && messageMap.has(messageId)) {
        return;
      }

      messages.push(msgObj);

      if (messageId) {
        messageMap.set(messageId, msgObj);
        if (imageUrl) {
          messageFiles.set(messageId, { url: imageUrl, fileName: fileName });
        } else if (isImage && !fileName) {
          messageFiles.set(messageId, { url: null, fileName: null }); // Placeholder
        }
      }

      if (shouldRender) {
        // Use renderAllMessages instead of appending to prevent render issues
        renderAllMessages();
      }
    } catch (error) {
      console.error('addMessage error:', error);
    }
  }

  async function loadChannelMessages(channel) {
    try {
      messages = [];
      messageMap.clear();
      messageFiles.clear();
      deletedMessageIds.clear();

      // Don't wipe content here, we did it in switchMode/logic before calling this.
      // But wait, reorder logic means we DO want to see "Loading..."
      // messageList.setContent(''); // REMOVED THIS to keep "Loading..." visible until renderAllMessages overwrites it.

      const fetchedMessages = await channel.messages.fetch({ limit: 50 });

      // RACECONDITION GUARD: If channel changed while fetching, abort
      if (!currentChannel || currentChannel.id !== channel.id) {
        return false;
      }

      const sortedMessages = Array.from(fetchedMessages.values()).reverse();

      for (const message of sortedMessages) {
        const hasImage = message.attachments && message.attachments.size > 0;
        const replyTo = message.reference?.messageId || null;

        let imageUrl = null;
        let fileName = null;
        if (hasImage) {
          const attachment = message.attachments.first();
          imageUrl = attachment?.url || null;
          fileName = attachment?.name || null;
        }

        // Use new formatter
        const messageContent = formatMessageContent(message);

        addMessage(
          message.author.username,
          messageContent,
          message.createdTimestamp,
          hasImage,
          message.author.id === client.user.id,
          message.id,
          replyTo,
          imageUrl,
          fileName,
          false // Don't render for each message load
        );
      }

      // Render once after loading all messages
      renderAllMessages();

      if (sortedMessages.length > 0) {
        const lastMessage = sortedMessages[sortedMessages.length - 1];
        channelLastReadMessage.set(channel.id, lastMessage.id);
      }

      screen.render();
      return true; // Success
    } catch (error) {
      console.error('loadChannelMessages error:', error);
      return false; // Failed
    }
  }

  function updateGuildList(selectedIndexOverride = null) {
    try {
      const currentSelected = selectedIndexOverride !== null ? selectedIndexOverride : (list.selected >= 0 ? list.selected : selectedIndex);
      const targetIdx = currentSelected < guilds.length ? currentSelected : 0;

      // Build items with '>' prefix for selected item
      const items = guilds.map((g, idx) => {
        const prefix = idx === targetIdx ? '{yellow-fg}>{/yellow-fg} ' : '  ';
        const name = g.name || '';
        return prefix + name;
      });

      // Update items directly to preserve scroll state
      list.setItems(items);

      if (items.length > 0) {
        if (targetIdx >= 0 && targetIdx < items.length) {
          if (list.selected !== targetIdx) {
            list.select(targetIdx);
          }
          // Ensure the selected item is visible (autoscroll)
          list.scrollTo(targetIdx);
        }
      }

      screen.render();
    } catch (error) {
      console.error('updateGuildList error:', error);
    }
  }

  function updateChannelList(selectedIndexOverride = null) {
    try {
      const currentSelected = selectedIndexOverride !== null ? selectedIndexOverride : (list.selected >= 0 ? list.selected : selectedIndex);
      const targetIdx = currentSelected < channels.length ? currentSelected : 0;

      // Build items with '>' prefix for selected item
      const items = channels.map((c, idx) => {
        const prefix = idx === targetIdx ? '{yellow-fg}>{/yellow-fg} ' : '  ';
        const name = c.name || '';
        return prefix + name;
      });

      // Update items directly to preserve scroll state
      list.setItems(items);

      if (items.length > 0) {
        if (targetIdx >= 0 && targetIdx < items.length) {
          if (list.selected !== targetIdx) {
            list.select(targetIdx);
          }
          // Ensure the selected item is visible (autoscroll)
          list.scrollTo(targetIdx);
        }
      }

      screen.render();
    } catch (error) {
      console.error('updateChannelList error:', error);
    }
  }

  // Manual navigation to prevent skipping and update '>' prefix
  list.on('keypress', (ch, key) => {
    if (key.name === 'down' || key.name === 'j') {
      if (list.selected < list.items.length - 1) {
        const nextIndex = list.selected + 1;
        if (mode === 'guilds') {
          updateGuildList(nextIndex);
        } else if (mode === 'channels') {
          updateChannelList(nextIndex);
        }
      }
      return false; // Prevent default behavior
    } else if (key.name === 'up' || key.name === 'k') {
      if (list.selected > 0) {
        const prevIndex = list.selected - 1;
        if (mode === 'guilds') {
          updateGuildList(prevIndex);
        } else if (mode === 'channels') {
          updateChannelList(prevIndex);
        }
      }
      return false; // Prevent default behavior
    } else if (key.name === 'enter') {
      const selectedIndex = list.selected;
      const selectedItem = list.items[selectedIndex];
      list.emit('select', selectedItem, selectedIndex);
      return false;
    }
  });

  list.on('select', async (item, index) => {
    selectedIndex = index;

    if (mode === 'guilds') {
      const selectedGuild = guilds[index];
      if (selectedGuild) {
        currentGuild = selectedGuild.guild;
        currentChannel = null; // Reset channel when switching guilds
        channels = [];

        try {
          const guildChannels = currentGuild.channels.cache;
          const channelsArray = [];

          // Separate categories and text channels
          const categories = [];
          const textChannels = [];

          for (const channel of guildChannels.values()) {
            const channelType = channel.type;
            const constructorName = channel.constructor?.name || '';

            // Check if channel is viewable (user has permission to see it)
            if (!channel.viewable) {
              continue; // Skip hidden channels
            }

            // Check if it's a category
            if (channelType === 4 ||
              channelType === 'GUILD_CATEGORY' ||
              channelType === 'category' ||
              constructorName === 'CategoryChannel') {
              categories.push(channel);
            }
            // Check if it's a text channel
            else if (channelType === 0 ||
              channelType === 'GUILD_TEXT' ||
              channelType === 'text' ||
              constructorName === 'TextChannel') {
              textChannels.push(channel);
            }
          }

          // Sort categories and channels by position
          categories.sort((a, b) => a.position - b.position);
          textChannels.sort((a, b) => a.position - b.position);

          // Group channels by category
          const channelsByCategory = new Map();
          const uncategorizedChannels = [];

          for (const channel of textChannels) {
            if (channel.parent) {
              const categoryId = channel.parent.id;
              if (!channelsByCategory.has(categoryId)) {
                channelsByCategory.set(categoryId, []);
              }
              channelsByCategory.get(categoryId).push(channel);
            } else {
              uncategorizedChannels.push(channel);
            }
          }

          // Build the list: categories with their channels
          for (const category of categories) {
            // Add category
            channelsArray.push({
              channel: category,
              name: `📁 ${safeEmoji(category.name) || 'Unnamed Category'}`,
              type: 'category'
            });

            // Add channels in this category
            const categoryChannels = channelsByCategory.get(category.id) || [];
            for (const channel of categoryChannels) {
              channelsArray.push({
                channel,
                name: `  # ${safeEmoji(channel.name) || 'Unnamed'}`,
                type: 'guild'
              });
            }
          }

          // Add uncategorized channels
          for (const channel of uncategorizedChannels) {
            channelsArray.push({
              channel,
              name: `# ${safeEmoji(channel.name) || 'Unnamed'}`,
              type: 'guild'
            });
          }

          channels = channelsArray;
          switchMode('channels');
          updateChannelList();
        } catch (error) {
          console.error('Error loading channels:', error);
        }
      }
    } else if (mode === 'channels') {
      const selectedChannel = channels[index];
      if (selectedChannel) {
        // Skip if it's a category
        if (selectedChannel.type === 'category') {
          return;
        }

        currentChannel = selectedChannel.channel;
        const channelName = selectedChannel.name.trim();
        header.setContent(`clicord (• Live) / Server Browser | ${currentGuild.name} > ${channelName}`);

        // Switch to chat mode FIRST to clear screen artifacts
        switchMode('chat');

        // Show loading indicator
        messageList.setContent('{center}Loading messages...{/center}');
        screen.render();

        const success = await loadChannelMessages(currentChannel);
        if (!success) {
          // Failed to load messages (e.g., Missing Access)
          // Go back to channels list
          messageList.setContent('{center}{red-fg}Failed to load messages (Missing Access?){/red-fg}{/center}');
          screen.render();
          setTimeout(() => {
            switchMode('channels');
          }, 1500);
        }
      }
    }
  });


  input.on('submit', async (value) => {
    const trimmedValue = (value || '').trim();

    input.clearValue();

    if (!trimmedValue || !currentChannel || mode !== 'chat') {
      input.focus();
      screen.render();
      return;
    }

    try {
      if (trimmedValue.startsWith('/')) {
        const parts = trimmedValue.split(' ');
        const command = parts[0].substring(1).toLowerCase();

        if (command === 'upload' && parts.length >= 2) {
          const filePath = parts.slice(1).join(' ').trim().replace(/^["']|["']$/g, '');

          if (!existsSync(filePath)) {
            addMessage('System', `File not found: ${filePath}`, Date.now());
          } else {
            try {
              addMessage('System', 'Uploading file...', Date.now());

              const sentMessage = await currentChannel.send({
                files: [{
                  attachment: filePath,
                  name: basename(filePath)
                }]
              });

              sentMessageIds.add(sentMessage.id);
              const hasImage = sentMessage.attachments && sentMessage.attachments.size > 0;
              let imageUrl = null;
              let fileName = null;
              if (hasImage) {
                const attachment = sentMessage.attachments.first();
                imageUrl = attachment?.url || null;
                fileName = attachment?.name || null;
              }

              addMessage(client.user.username, '', sentMessage.createdTimestamp, hasImage, true, sentMessage.id, null, imageUrl, fileName);
            } catch (error) {
              addMessage('System', `Error uploading file: ${error.message}`, Date.now());
            }
          }
        }
        else if (command === 'upload') {
          addMessage('System', 'Usage: /upload <file_path>', Date.now());
        }
        else if (command === 'view' && parts.length >= 2) {
          const shortId = parts[1];

          let foundFileInfo = null;
          for (const [msgId, fileInfo] of messageFiles.entries()) {
            if (msgId.startsWith(shortId)) {
              foundFileInfo = fileInfo;
              break;
            }
          }

          if (foundFileInfo) {
            const fileUrl = typeof foundFileInfo === 'string' ? foundFileInfo : foundFileInfo.url;
            const fileName = typeof foundFileInfo === 'object' ? foundFileInfo.fileName : null;
            openFileInBrowser(fileUrl, fileName);
            addMessage('System', 'Opening file in browser...', Date.now());
          } else {
            addMessage('System', `File not found. ID: ${shortId}`, Date.now());
          }
        }
        else if (command === 'view') {
          addMessage('System', 'Usage: /view <message_id>', Date.now());
        }
        else if (command === 'reply' && parts.length >= 3) {
          const replyToId = parts[1];
          const replyContent = parts.slice(2).join(' ');

          const sentMessage = await currentChannel.send({
            content: replyContent,
            reply: { messageReference: replyToId }
          });

          sentMessageIds.add(sentMessage.id);
          addMessage(client.user.username, replyContent, sentMessage.createdTimestamp, false, true, sentMessage.id, replyToId);
          replyToMessageId = null;
        }
        else if (command === 'reply') {
          addMessage('System', 'Usage: /reply <message_id> <message>', Date.now());
        }
        else if (command === 'r' && parts.length >= 3) {
          const replyToId = parts[1];
          const replyContent = parts.slice(2).join(' ');

          const sentMessage = await currentChannel.send({
            content: replyContent,
            reply: { messageReference: replyToId }
          });

          sentMessageIds.add(sentMessage.id);
          addMessage(client.user.username, replyContent, sentMessage.createdTimestamp, false, true, sentMessage.id, replyToId);
          replyToMessageId = null;
        }
        else if (command === 'r') {
          addMessage('System', 'Usage: /r <message_id> <message>', Date.now());
        }
        else if (command === 'delete' && parts.length >= 2) {
          const messageId = parts[1];

          try {
            const message = await currentChannel.messages.fetch(messageId);

            if (message.author.id === client.user.id) {
              await message.delete();
              addMessage('System', `Message deleted: ${messageId}`, Date.now());
            } else {
              addMessage('System', 'You can only delete your own messages.', Date.now());
            }
          } catch (error) {
            if (error.code === 10008) {
              addMessage('System', `Message not found: ${messageId}`, Date.now());
            } else {
              addMessage('System', `Error deleting message: ${error.message}`, Date.now());
            }
          }
        }
        else if (command === 'delete') {
          addMessage('System', 'Usage: /delete <message_id>', Date.now());
        }
        else if (command === 'edit' && parts.length >= 3) {
          const messageId = parts[1];
          const newContent = parts.slice(2).join(' ');

          try {
            const message = await currentChannel.messages.fetch(messageId);

            if (message.author.id === client.user.id) {
              await message.edit(newContent);
              addMessage('System', `Message edited: ${messageId}`, Date.now());

              if (messageMap.has(messageId)) {
                const msgObj = messageMap.get(messageId);
                msgObj.content = newContent;
                renderAllMessages();
              }
            } else {
              addMessage('System', 'You can only edit your own messages.', Date.now());
            }
          } catch (error) {
            if (error.code === 10008) {
              addMessage('System', `Message not found: ${messageId}`, Date.now());
            } else {
              addMessage('System', `Error editing message: ${error.message}`, Date.now());
            }
          }
        }
        else if (command === 'edit') {
          addMessage('System', 'Usage: /edit <message_id> <new_message>', Date.now());
        }
        else if (command === 'help') {
          addMessage('System', 'Commands:\n- /upload <file_path>: Upload file\n- /view <message_id>: Open file in browser\n- /reply <message_id> <message>: Reply to message\n- /r <message_id> <message>: Reply to message (short)\n- /delete <message_id>: Delete message\n- /edit <message_id> <new_message>: Edit message', Date.now());
        }
        else {
          addMessage('System', `Unknown command: ${command}. Use /help for help.`, Date.now());
        }
      } else {
        const sentMessage = await currentChannel.send(trimmedValue);

        sentMessageIds.add(sentMessage.id);
        addMessage(client.user.username, trimmedValue, sentMessage.createdTimestamp, false, true, sentMessage.id, replyToMessageId);
        replyToMessageId = null;
      }
    } catch (error) {
      addMessage('System', `Error: ${error.message}`, Date.now());
    }

    setImmediate(() => {
      messageList.setScrollPerc(100);
      input.focus();
      screen.render();
    });
  });

  input.on('keypress', () => {
    screen.render();
  });

  input.key(['C-d'], () => {
    if (mode === 'chat') {
      input.clearValue();
      input.focus();
      screen.render();
    }
  });


  client.on('messageDelete', (deletedMessage) => {
    if (currentChannel && deletedMessage.channel.id === currentChannel.id && mode === 'chat') {
      deletedMessageIds.add(deletedMessage.id);
      renderAllMessages();
    }
  });

  client.on('messageUpdate', (oldMessage, newMessage) => {
    try {
      if (currentChannel && newMessage.channel.id === currentChannel.id && mode === 'chat') {
        if (newMessage.id && messageMap.has(newMessage.id)) {
          const msgObj = messageMap.get(newMessage.id);

          // Use new formatter
          msgObj.content = formatMessageContent(newMessage);

          renderAllMessages();
        }
      }
    } catch (error) {
      console.error('messageUpdate error:', error);
    }
  });

  client.on('messageCreate', (message) => {
    try {
      if (currentChannel && message.channel.id === currentChannel.id && mode === 'chat') {
        const isOwnMessage = message.author.id === client.user.id;

        if (messageMap.has(message.id) || (isOwnMessage && sentMessageIds.has(message.id))) {
          return;
        }

        const hasImage = message.attachments && message.attachments.size > 0;
        const replyTo = message.reference?.messageId || null;

        let imageUrl = null;
        let fileName = null;
        if (hasImage) {
          const attachment = message.attachments.first();
          imageUrl = attachment?.url || null;
          fileName = attachment?.name || null;
        }

        // Use new formatter
        const messageContent = formatMessageContent(message);

        addMessage(
          message.author.username,
          messageContent,
          message.createdTimestamp,
          hasImage,
          isOwnMessage,
          message.id,
          replyTo,
          imageUrl,
          fileName
        );

        setImmediate(() => {
          messageList.setScrollPerc(100);
          screen.render();
        });
      }
    } catch (error) {
      console.error('messageCreate error:', error);
    }
  });

  screen.key(['escape'], () => {
    if (mode === 'chat') {
      switchMode('channels');
      updateChannelList();
    } else if (mode === 'channels') {
      switchMode('guilds');
      updateGuildList();
    } else {
      return process.exit(0);
    }
  });


  try {
    await client.login(token);
  } catch (error) {
    console.error(chalk.red('Giriş hatası:'), error);
    process.exit(1);
  }

  client.once('ready', async () => {
    const statusText = `clicord (• Live) / Server Browser`;
    header.setContent(statusText);

    switchMode('guilds');

    guilds = [];

    try {
      const allGuilds = client.guilds.cache;

      for (const guild of allGuilds.values()) {
        guilds.push({
          guild,
          name: guild.name || 'Unknown Server'
        });
      }

      guilds.sort((a, b) => a.name.localeCompare(b.name));
      updateGuildList();

    } catch (error) {
      console.error('Error loading guilds:', error);
    }
  });
}

