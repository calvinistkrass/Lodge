import React from 'react';
import { Text, Linking } from 'react-native';
import { Icon } from './ui';

// Statt bunter Emojis nutzt Lodge einheitliche Symbole. Shortcodes wie :heart:
// sowie klassische Smileys und die häufigsten Unicode-Emojis werden ersetzt.
export const SYMBOLS = {
  heart: { icon: 'heart', color: '#ff4f6d' },
  like: { icon: 'thumbs-up', color: '#f5b400' },
  dislike: { icon: 'thumbs-down', color: '#f5b400' },
  smile: { icon: 'happy', color: '#f5c400' },
  sad: { icon: 'sad', color: '#5aa9ff' },
  fire: { icon: 'flame', color: '#ff7a1a' },
  star: { icon: 'star', color: '#f5c400' },
  check: { icon: 'checkmark-circle', color: '#23c55e' },
  cross: { icon: 'close-circle', color: '#ef4757' },
  eyes: { icon: 'eye', color: '#a2a7b8' },
  rocket: { icon: 'rocket', color: '#7c5cff' },
  trophy: { icon: 'trophy', color: '#f5b400' },
  skull: { icon: 'skull', color: '#d0d3dc' },
  game: { icon: 'game-controller', color: '#7c5cff' },
  music: { icon: 'musical-notes', color: '#ff4f8b' },
  coffee: { icon: 'cafe', color: '#c58b5a' },
  pizza: { icon: 'pizza', color: '#ff8a3d' },
  party: { icon: 'sparkles', color: '#f5c400' },
  gift: { icon: 'gift', color: '#ff4f8b' },
  moon: { icon: 'moon', color: '#a56bff' },
  sun: { icon: 'sunny', color: '#f5c400' },
  bolt: { icon: 'flash', color: '#f5c400' },
  idea: { icon: 'bulb', color: '#f5c400' },
  question: { icon: 'help-circle', color: '#2bb3ff' },
  warning: { icon: 'warning', color: '#f5b400' },
  sleep: { icon: 'bed', color: '#a2a7b8' },
  wave: { icon: 'hand-left', color: '#f5c400' },
  clap: { icon: 'hand-right', color: '#f5c400' },
  hundred: { icon: 'medal', color: '#ef4757' },
  ghost: { icon: 'skull-outline', color: '#d0d3dc' },
};

const EMOTICONS = {
  ':)': 'smile',
  ':-)': 'smile',
  ':D': 'smile',
  ':(': 'sad',
  ':-(': 'sad',
  '<3': 'heart',
  '(y)': 'like',
};

const UNICODE = {
  '❤️': 'heart',
  '❤': 'heart',
  '👍': 'like',
  '👎': 'dislike',
  '😀': 'smile',
  '😃': 'smile',
  '😄': 'smile',
  '😁': 'smile',
  '😂': 'smile',
  '🤣': 'smile',
  '😊': 'smile',
  '🙂': 'smile',
  '😢': 'sad',
  '😭': 'sad',
  '🙁': 'sad',
  '🔥': 'fire',
  '⭐': 'star',
  '✅': 'check',
  '❌': 'cross',
  '👀': 'eyes',
  '🚀': 'rocket',
  '🏆': 'trophy',
  '💀': 'skull',
  '🎮': 'game',
  '🎵': 'music',
  '☕': 'coffee',
  '🍕': 'pizza',
  '🎉': 'party',
  '🎁': 'gift',
  '🌙': 'moon',
  '☀️': 'sun',
  '⚡': 'bolt',
  '💡': 'idea',
  '❓': 'question',
  '⚠️': 'warning',
  '😴': 'sleep',
  '👋': 'wave',
  '👏': 'clap',
  '💯': 'hundred',
  '👻': 'ghost',
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TOKEN = new RegExp(
  [
    '(https?:\\/\\/[^\\s]+)', // 1 Link
    '(`[^`]+`)', // 2 Code
    '(\\*\\*[^*]+\\*\\*)', // 3 fett
    '(\\*[^*\\s][^*]*\\*)', // 4 kursiv
    '(@[A-Za-z0-9_.]+)', // 5 Erwähnung
    '(:[a-z]+:)', // 6 Shortcode
    `((?:^|(?<=\\s))(?:${Object.keys(EMOTICONS).map(escape).join('|')})(?=\\s|$))`, // 7 Smiley
    `(${Object.keys(UNICODE).map(escape).join('|')})`, // 8 Unicode-Emoji
  ].join('|'),
  'g'
);

function SymbolIcon({ name, size }) {
  const s = SYMBOLS[name];
  return <Icon name={s.icon} size={size} color={s.color} />;
}

export function MessageText({ content, theme, meName, size = 15 }) {
  const parts = [];
  let last = 0;
  let key = 0;
  const onlySymbols = content.replace(TOKEN, (m) => (symbolFor(m) ? '' : m)).trim() === '';
  const iconSize = onlySymbols ? 34 : size + 3;
  for (const m of content.matchAll(TOKEN)) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    const [tok, link, code, bold, italic, mention] = m;
    const sym = symbolFor(tok);
    if (link)
      parts.push(
        <Text key={key++} style={{ color: theme.accent, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(link)}>
          {link}
        </Text>
      );
    else if (code)
      parts.push(
        <Text key={key++} style={{ fontFamily: 'monospace', backgroundColor: theme.input, color: theme.text, fontSize: size - 1 }}>
          {' '}
          {code.slice(1, -1)}{' '}
        </Text>
      );
    else if (bold) parts.push(<Text key={key++} style={{ fontWeight: '800' }}>{bold.slice(2, -2)}</Text>);
    else if (italic) parts.push(<Text key={key++} style={{ fontStyle: 'italic' }}>{italic.slice(1, -1)}</Text>);
    else if (mention) {
      const isMe = mention.slice(1).toLowerCase() === meName?.toLowerCase();
      parts.push(
        <Text key={key++} style={{ color: theme.accent, backgroundColor: theme.accentSoft, fontWeight: '600', ...(isMe ? { color: '#fff', backgroundColor: theme.accent } : null) }}>
          {mention}
        </Text>
      );
    } else if (sym) parts.push(<SymbolIcon key={key++} name={sym} size={iconSize} />);
    else parts.push(tok);
    last = m.index + tok.length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return <Text style={{ color: theme.text, fontSize: theme.fs(size), lineHeight: theme.fs(size) * 1.4 }}>{parts}</Text>;
}

function symbolFor(tok) {
  if (tok.startsWith(':') && tok.endsWith(':') && SYMBOLS[tok.slice(1, -1)]) return tok.slice(1, -1);
  if (EMOTICONS[tok]) return EMOTICONS[tok];
  if (UNICODE[tok]) return UNICODE[tok];
  return null;
}
