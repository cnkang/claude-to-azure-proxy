/**
 * Mock implementation of Prism.js for testing
 */

const mockPrism = {
  highlight: (code: string, _grammar: unknown, _language: string) => code,
  languages: {
    javascript: {
      'class-name': /\b[A-Z]\w*\b/,
      function: /\b\w+(?=\()/,
      keyword:
        /\b(?:var|let|const|function|class|if|else|for|while|return|import|export|default)\b/,
      string: /(["'])(?:(?!\1)[^\\]|\\.)*\1/,
      number: /\b\d+\b/,
      operator: /[+\-*/%=<>!&|]/,
      punctuation: /[{}[\];(),.:]/,
    },
    typescript: {
      'class-name': /\b[A-Z]\w*\b/,
      function: /\b\w+(?=\()/,
      keyword:
        /\b(?:var|let|const|function|class|interface|type|if|else|for|while|return|import|export|default)\b/,
      string: /(["'])(?:(?!\1)[^\\]|\\.)*\1/,
      number: /\b\d+\b/,
      operator: /[+\-*/%=<>!&|]/,
      punctuation: /[{}[\];(),.:]/,
    },
    python: {
      'class-name': /\b[A-Z]\w*\b/,
      function: /\b\w+(?=\()/,
      keyword:
        /\b(?:def|class|if|else|elif|for|while|return|import|from|as|try|except|finally|with|lambda|yield|async|await)\b/,
      string: /(["'])(?:(?!\1)[^\\]|\\.)*\1/,
      number: /\b\d+\b/,
      operator: /[+\-*/%=<>!&|]/,
      punctuation: /[{}[\];(),.:]/,
    },
    java: {
      'class-name': /\b[A-Z]\w*\b/,
      function: /\b\w+(?=\()/,
      keyword:
        /\b(?:public|private|protected|static|final|class|interface|extends|implements|if|else|for|while|return|import|package)\b/,
      string: /(["'])(?:(?!\1)[^\\]|\\.)*\1/,
      number: /\b\d+\b/,
      operator: /[+\-*/%=<>!&|]/,
      punctuation: /[{}[\];(),.:]/,
    },
    cpp: {
      'class-name': /\b[A-Z]\w*\b/,
      function: /\b\w+(?=\()/,
      keyword:
        /\b(?:int|char|float|double|void|class|struct|public|private|protected|if|else|for|while|return|include|namespace|using)\b/,
      string: /(["'])(?:(?!\1)[^\\]|\\.)*\1/,
      number: /\b\d+\b/,
      operator: /[+\-*/%=<>!&|]/,
      punctuation: /[{}[\];(),.:]/,
    },
    c: {
      'class-name': /\b[A-Z]\w*\b/,
      function: /\b\w+(?=\()/,
      keyword:
        /\b(?:int|char|float|double|void|struct|if|else|for|while|return|include)\b/,
      string: /(["'])(?:(?!\1)[^\\]|\\.)*\1/,
      number: /\b\d+\b/,
      operator: /[+\-*/%=<>!&|]/,
      punctuation: /[{}[\];(),.:]/,
    },
    css: {
      'class-name': /\.[a-zA-Z][\w-]*/,
      property: /\b[a-z-]+(?=\s*:)/,
      selector: /[^{}]+(?=\s*\{)/,
      string: /(["'])(?:(?!\1)[^\\]|\\.)*\1/,
      number: /\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw)?\b/,
      punctuation: /[{}:;,]/,
    },
    html: {
      'class-name': /\b[A-Z]\w*\b/,
      tag: /<\/?[a-zA-Z][\w-]*>/,
      'attr-name': /\b[a-zA-Z][\w-]*(?=\s*=)/,
      'attr-value': /(["'])(?:(?!\1)[^\\]|\\.)*\1/,
      punctuation: /[<>="']/,
    },
    json: {
      property: /"[^"]*"(?=\s*:)/,
      string: /"[^"]*"/,
      number: /\b\d+(?:\.\d+)?\b/,
      boolean: /\b(?:true|false)\b/,
      null: /\bnull\b/,
      punctuation: /[{}[\],]/,
    },
    markdown: {
      title: /^#{1,6}.+$/m,
      code: /`[^`]+`/,
      url: /https?:\/\/[^\s]+/,
      bold: /\*\*[^*]+\*\*/,
      italic: /\*[^*]+\*/,
      punctuation: /[*#`\[\]()]/,
    },
  },
  plugins: {
    toolbar: {},
    'copy-to-clipboard': {},
    'line-numbers': {},
  },
  util: {
    encode: (tokens: unknown) => tokens,
    type: (o: unknown) => Object.prototype.toString.call(o).slice(8, -1),
  },
  Token: class Token {
    type: string;
    content: unknown;
    alias?: string;
    length: number;

    constructor(
      type: string,
      content: unknown,
      alias?: string,
      matchedStr?: string
    ) {
      this.type = type;
      this.content = content;
      this.alias = alias;
      this.length = (matchedStr || '').length || 0;
    }
  },
};

// Set global Prism for components that expect it
(globalThis as { Prism?: typeof mockPrism }).Prism = mockPrism;

export default mockPrism;
export const { highlight, languages, plugins, util, Token } = mockPrism;
