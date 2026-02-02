const parsley = (function() {
  let options = { gfm: true, breaks: false };

  function escape(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseInline(text) {
    let result = '';
    let i = 0;

    while (i < text.length) {
      if (text[i] === '\\' && i + 1 < text.length) {
        result += escape(text[i + 1]);
        i += 2;
        continue;
      }

      if (text[i] === '`') {
        const match = text.slice(i).match(/^`([^`]+)`/);
        if (match) {
          result += '<code>' + escape(match[1]) + '</code>';
          i += match[0].length;
          continue;
        }
      }

      if (text[i] === '!' && text[i + 1] === '[') {
        const match = text.slice(i).match(/^!\[([^\]]*)\]\(([^)]+)\)/);
        if (match) {
          result += '<img src="' + escape(match[2]) + '" alt="' + escape(match[1]) + '">';
          i += match[0].length;
          continue;
        }
      }

      if (text[i] === '[') {
        const match = text.slice(i).match(/^\[([^\]]+)\]\(([^)]+)\)/);
        if (match) {
          result += '<a href="' + escape(match[2]) + '">' + parseInline(match[1]) + '</a>';
          i += match[0].length;
          continue;
        }
      }

      if (text[i] === '*' || text[i] === '_') {
        const char = text[i];

        if (text.slice(i, i + 3) === char.repeat(3)) {
          const end = text.indexOf(char.repeat(3), i + 3);
          if (end !== -1) {
            result += '<strong><em>' + parseInline(text.slice(i + 3, end)) + '</em></strong>';
            i = end + 3;
            continue;
          }
        }

        if (text.slice(i, i + 2) === char.repeat(2)) {
          const end = text.indexOf(char.repeat(2), i + 2);
          if (end !== -1) {
            result += '<strong>' + parseInline(text.slice(i + 2, end)) + '</strong>';
            i = end + 2;
            continue;
          }
        }

        if (text[i + 1] && text[i + 1] !== ' ') {
          const end = text.indexOf(char, i + 1);
          if (end !== -1 && text[end - 1] !== ' ') {
            result += '<em>' + parseInline(text.slice(i + 1, end)) + '</em>';
            i = end + 1;
            continue;
          }
        }
      }

      if (text.slice(i, i + 2) === '~~') {
        const end = text.indexOf('~~', i + 2);
        if (end !== -1) {
          result += '<del>' + parseInline(text.slice(i + 2, end)) + '</del>';
          i = end + 2;
          continue;
        }
      }

      const autolink = text.slice(i).match(/^(https?:\/\/[^\s<]+)/);
      if (autolink) {
        const url = autolink[1].replace(/[.,;:!?)]+$/, '');
        result += '<a href="' + escape(url) + '">' + escape(url) + '</a>';
        i += url.length;
        continue;
      }

      if (text[i] === '<') {
        const htmlMatch = text.slice(i).match(/^<(\/?)(kbd|sub|sup|br|details|summary)(\s[^>]*)?\/?>/i);
        if (htmlMatch) {
          result += htmlMatch[0];
          i += htmlMatch[0].length;
          continue;
        }
      }

      result += escape(text[i]);
      i++;
    }

    return result;
  }

  function parseListItems(lines, start, indent, listType) {
    const items = [];
    let i = start;
    let currentItem = null;
    let hadEmptyLine = false;

    while (i < lines.length) {
      const line = lines[i];
      const lineIndent = line.match(/^(\s*)/)[1].length;

      if (lineIndent < indent && line.trim() !== '') {
        break;
      }

      const listMatch = line.match(/^(\s*)(-|\*|\+|\d+\.)\s+(.*)$/);

      if (listMatch && listMatch[1].length === indent) {
        const isOrdered = /^\d+\./.test(listMatch[2]);

        if (hadEmptyLine || (listType !== undefined && isOrdered !== listType)) {
          break;
        }
        if (listType === undefined) {
          listType = isOrdered;
        }

        if (currentItem) items.push(currentItem);
        const taskMatch = listMatch[3].match(/^\[([ xX])\]\s*(.*)/);
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === 'x';
          currentItem = {
            content: taskMatch[2],
            checked: checked,
            isTask: true,
            children: [],
            ordered: isOrdered
          };
        } else {
          currentItem = {
            content: listMatch[3],
            children: [],
            ordered: isOrdered
          };
        }
        hadEmptyLine = false;
        i++;
      } else if (listMatch && listMatch[1].length > indent && currentItem) {
        const nestedType = /^\d+\./.test(listMatch[2]);
        const nested = parseListItems(lines, i, listMatch[1].length, nestedType);
        currentItem.children = nested.items;
        currentItem.childOrdered = nested.ordered;
        i = nested.end;
        hadEmptyLine = false;
      } else if (lineIndent > indent && currentItem && line.trim() !== '') {
        currentItem.content += '\n' + line.trim();
        i++;
      } else if (line.trim() === '') {
        hadEmptyLine = true;
        i++;
      } else {
        break;
      }
    }

    if (currentItem) items.push(currentItem);

    return {
      items: items,
      end: i,
      ordered: listType
    };
  }

  function renderList(items, ordered) {
    const tag = ordered ? 'ol' : 'ul';
    let html = '<' + tag + '>\n';

    for (const item of items) {
      if (item.isTask) {
        const checkbox = item.checked
          ? '<input type="checkbox" checked disabled>'
          : '<input type="checkbox" disabled>';
        html += '<li>' + checkbox + parseInline(item.content);
      } else {
        html += '<li>' + parseInline(item.content);
      }

      if (item.children && item.children.length > 0) {
        html += '\n' + renderList(item.children, item.childOrdered);
      }

      html += '</li>\n';
    }

    html += '</' + tag + '>';
    return html;
  }

  function parseTable(lines) {
    if (lines.length < 2) return null;

    const headerLine = lines[0];
    const separatorLine = lines[1];

    if (!separatorLine.match(/^\|?[\s\-:|]+\|?$/)) return null;

    const parseRow = (line) => {
      return line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
    };

    const headers = parseRow(headerLine);
    const separators = parseRow(separatorLine);

    const aligns = separators.map(sep => {
      if (sep.startsWith(':') && sep.endsWith(':')) return 'center';
      if (sep.endsWith(':')) return 'right';
      return 'left';
    });

    let html = '<table>\n<thead>\n<tr>\n';
    for (let i = 0; i < headers.length; i++) {
      html += '<th align="' + aligns[i] + '">' + parseInline(headers[i]) + '</th>\n';
    }
    html += '</tr>\n</thead>\n<tbody>\n';

    for (let r = 2; r < lines.length; r++) {
      if (!lines[r].includes('|')) break;
      const cells = parseRow(lines[r]);
      html += '<tr>\n';
      for (let i = 0; i < headers.length; i++) {
        html += '<td align="' + aligns[i] + '">' + parseInline(cells[i] || '') + '</td>\n';
      }
      html += '</tr>\n';
    }

    html += '</tbody>\n</table>';
    return { html: html, consumed: lines.length };
  }

  function parseBlockquote(lines) {
    const content = [];
    let i = 0;

    while (i < lines.length && lines[i].startsWith('>')) {
      content.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }

    const inner = parse(content.join('\n'));
    return { html: '<blockquote>\n' + inner + '</blockquote>', consumed: i };
  }

  function parse(markdown) {
    const lines = markdown.split('\n');
    let html = '';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim() === '') {
        i++;
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        html += '<h' + level + '>' + parseInline(headingMatch[2]) + '</h' + level + '>\n';
        i++;
        continue;
      }

      if (line.match(/^```/)) {
        const lang = line.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].match(/^```/)) {
          codeLines.push(lines[i]);
          i++;
        }
        i++;
        const code = escape(codeLines.join('\n'));
        if (lang) {
          html += '<pre><code class="language-' + lang + '">' + code + '</code></pre>\n';
        } else {
          html += '<pre><code>' + code + '</code></pre>\n';
        }
        continue;
      }

      if (line.match(/^(\-{3,}|\*{3,}|_{3,})$/)) {
        html += '<hr>\n';
        i++;
        continue;
      }

      if (line.startsWith('>')) {
        const block = parseBlockquote(lines.slice(i));
        html += block.html + '\n';
        i += block.consumed;
        continue;
      }

      const listMatch = line.match(/^(\s*)(-|\*|\+|\d+\.)\s+/);
      if (listMatch) {
        const isOrdered = /^\d+\./.test(listMatch[2]);
        const result = parseListItems(lines, i, listMatch[1].length, isOrdered);
        html += renderList(result.items, result.ordered) + '\n';
        i = result.end;
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\|?[\s\-:|]+\|?$/)) {
        let tableLines = [];
        let j = i;
        while (j < lines.length && lines[j].includes('|')) {
          tableLines.push(lines[j]);
          j++;
        }
        const table = parseTable(tableLines);
        if (table) {
          html += table.html + '\n';
          i = j;
          continue;
        }
      }

      if (line.match(/^<(details|div|section|article|aside|header|footer|nav|form|fieldset|figure|figcaption|main)/i)) {
        let blockLines = [line];
        const tagMatch = line.match(/^<(\w+)/);
        const tag = tagMatch[1].toLowerCase();
        let depth = 1;
        i++;

        while (i < lines.length && depth > 0) {
          blockLines.push(lines[i]);
          const opens = (lines[i].match(new RegExp('<' + tag + '(\\s|>)', 'gi')) || []).length;
          const closes = (lines[i].match(new RegExp('</' + tag + '>', 'gi')) || []).length;
          depth += opens - closes;
          i++;
        }

        const blockText = blockLines.join('\n');

        if (tag === 'details') {
          const summaryMatch = blockText.match(/^(<details[^>]*>[\s\S]*?<\/summary>)([\s\S]*?)(<\/details>)$/i);
          if (summaryMatch) {
            const inner = parse(summaryMatch[2].trim());
            html += summaryMatch[1] + '\n' + inner + summaryMatch[3] + '\n';
            continue;
          }
        }

        html += blockText + '\n';
        continue;
      }

      const paragraph = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+\.\s|(\-{3,}|\*{3,}|_{3,})$|<(details|div))/)) {
        paragraph.push(lines[i]);
        i++;
      }

      if (paragraph.length > 0) {
        const text = options.breaks
          ? paragraph.map(l => parseInline(l)).join('<br>\n')
          : parseInline(paragraph.join('\n'));
        html += '<p>' + text + '</p>\n';
      }
    }

    return html;
  }

  return {
    parse: parse,
    setOptions: function(opts) {
      options = { ...options, ...opts };
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = parsley;
}
