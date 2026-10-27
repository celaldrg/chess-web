/**
 * User interface strings in English and Turkish. Pure lookups plus one
 * helper that fills `data-i18n*` attributes when it is called.
 */

export const LANGUAGES = Object.freeze(['en', 'tr']);
export const DEFAULT_LANGUAGE = 'en';

/** Every string the interface shows, per language. */
export const STRINGS = Object.freeze({
  en: Object.freeze({
    title: 'Chess',
    newGame: 'New game',
    langButton: 'TR',
    langSwitch: 'TR – switch to Turkish',
    boardLabel: 'Chessboard',
    moves: 'Moves',
    noMoves: 'No moves yet. White starts.',
    undo: 'Undo',
    flip: 'Flip board',
    copyPgn: 'Copy PGN',
    downloadPgn: 'Download PGN',
    hint: 'Tap or drag a piece to move it. Keys: arrows + Enter to move, Esc to cancel, F flip, U undo, N new game.',
    footerSource: 'Source on GitHub',
    white: 'White',
    black: 'Black',
    you: 'You',
    computer: 'Computer · {level}',
    whiteToMove: 'White to move',
    blackToMove: 'Black to move',
    yourMove: 'Your move',
    thinking: 'Computer is thinking…',
    check: 'Check!',
    whiteWins: 'Checkmate · White wins',
    blackWins: 'Checkmate · Black wins',
    stalemate: 'Stalemate · Draw',
    drawThreefold: 'Draw by threefold repetition',
    drawFifty: 'Draw by the fifty-move rule',
    drawMaterial: 'Draw by insufficient material',
    setupTitle: 'New game',
    mode: 'Mode',
    modeAi: 'vs Computer',
    modePvp: '2 players',
    playAs: 'Play as',
    level: 'Level',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    start: 'Start',
    cancel: 'Cancel',
    promoteTitle: 'Promote pawn to',
    pawn: 'Pawn',
    knight: 'Knight',
    bishop: 'Bishop',
    rook: 'Rook',
    queen: 'Queen',
    king: 'King',
    squareEmpty: '{square}',
    squarePiece: '{square}, {color} {piece}',
    copied: 'PGN copied to the clipboard',
    copyFailed: 'Could not copy. Use Download PGN instead.',
  }),
  tr: Object.freeze({
    title: 'Satranç',
    newGame: 'Yeni oyun',
    langButton: 'EN',
    langSwitch: 'EN – İngilizceye geç',
    boardLabel: 'Satranç tahtası',
    moves: 'Hamleler',
    noMoves: 'Henüz hamle yok. Beyaz başlar.',
    undo: 'Geri al',
    flip: 'Tahtayı çevir',
    copyPgn: 'PGN kopyala',
    downloadPgn: 'PGN indir',
    hint: 'Taşı oynatmak için dokun ya da sürükle. Tuşlar: oklar + Enter oynar, Esc vazgeçer, F çevirir, U geri alır, N yeni oyun.',
    footerSource: "GitHub'da kaynak kod",
    white: 'Beyaz',
    black: 'Siyah',
    you: 'Sen',
    computer: 'Bilgisayar · {level}',
    whiteToMove: 'Sıra Beyazda',
    blackToMove: 'Sıra Siyahta',
    yourMove: 'Sıra sende',
    thinking: 'Bilgisayar düşünüyor…',
    check: 'Şah!',
    whiteWins: 'Şah mat · Beyaz kazandı',
    blackWins: 'Şah mat · Siyah kazandı',
    stalemate: 'Pat · Berabere',
    drawThreefold: 'Üç kez tekrar · Berabere',
    drawFifty: 'Elli hamle kuralı · Berabere',
    drawMaterial: 'Yetersiz taş · Berabere',
    setupTitle: 'Yeni oyun',
    mode: 'Mod',
    modeAi: 'Bilgisayara karşı',
    modePvp: '2 oyuncu',
    playAs: 'Rengin',
    level: 'Seviye',
    easy: 'Kolay',
    medium: 'Orta',
    hard: 'Zor',
    start: 'Başla',
    cancel: 'Vazgeç',
    promoteTitle: 'Piyon neye terfi etsin?',
    pawn: 'Piyon',
    knight: 'At',
    bishop: 'Fil',
    rook: 'Kale',
    queen: 'Vezir',
    king: 'Şah',
    squareEmpty: '{square}',
    squarePiece: '{square}, {color} {piece}',
    copied: 'PGN panoya kopyalandı',
    copyFailed: 'Kopyalanamadı. PGN indir düğmesini kullan.',
  }),
});

/**
 * Picks a supported language, falling back to English.
 * @param {unknown} lang
 * @returns {'en'|'tr'}
 */
export function normalizeLanguage(lang) {
  return LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
}

/**
 * The other language, for the toggle button.
 * @param {'en'|'tr'} lang
 * @returns {'en'|'tr'}
 */
export function otherLanguage(lang) {
  return normalizeLanguage(lang) === 'en' ? 'tr' : 'en';
}

/**
 * Looks up a string and fills `{name}` placeholders.
 * @param {'en'|'tr'} lang
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function translate(lang, key, params = {}) {
  const template = STRINGS[normalizeLanguage(lang)][key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/**
 * Fills text, aria-label and title of every element under `root` that has a
 * `data-i18n`, `data-i18n-aria` or `data-i18n-title` attribute.
 * @param {ParentNode} root
 * @param {(key: string) => string} t
 */
export function applyTranslations(root, t) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
