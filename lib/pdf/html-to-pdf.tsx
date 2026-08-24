import React from 'react';
import { View, Text, Image } from '@react-pdf/renderer';
import { parseDocument } from 'htmlparser2';
import type { Element, Text as DomText, ChildNode } from 'domhandler';

interface TextStyle {
  fontWeight?: number;
  fontStyle?: 'italic' | 'normal';
  textDecoration?: 'underline' | 'line-through' | 'none';
}

function isElement(n: ChildNode): n is Element {
  return n.type === 'tag';
}
function isText(n: ChildNode): n is DomText {
  return n.type === 'text';
}

function renderInline(nodes: ChildNode[], style: TextStyle, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  nodes.forEach((n, i) => {
    const key = `${keyPrefix}-${i}`;
    if (isText(n)) {
      if (n.data.trim() === '' && !/\S/.test(n.data)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.push(<Text key={key} style={style as any}>{n.data}</Text>);
    } else if (isElement(n)) {
      const tag = n.name.toLowerCase();
      if (tag === 'strong' || tag === 'b') out.push(...renderInline(n.children, { ...style, fontWeight: 700 }, key));
      else if (tag === 'em' || tag === 'i') out.push(...renderInline(n.children, { ...style, fontStyle: 'italic' }, key));
      else if (tag === 'u') out.push(...renderInline(n.children, { ...style, textDecoration: 'underline' }, key));
      else if (tag === 's' || tag === 'strike') out.push(...renderInline(n.children, { ...style, textDecoration: 'line-through' }, key));
      else if (tag === 'br') out.push(<Text key={key}>{'\n'}</Text>);
      else out.push(...renderInline(n.children, style, key));
    }
  });
  return out;
}

function renderTable(el: Element, key: string): React.ReactNode {
  const rows: Element[] = [];
  const collectRows = (nodes: ChildNode[]) => {
    for (const n of nodes) {
      if (!isElement(n)) continue;
      if (n.name === 'tr') rows.push(n);
      else collectRows(n.children);
    }
  };
  collectRows(el.children);

  return (
    <View key={key} style={{ border: '1px solid #999', marginVertical: 6 }}>
      {rows.map((row, ri) => {
        const cells = row.children.filter(isElement).filter(c => c.name === 'td' || c.name === 'th');
        return (
          <View key={ri} style={{ flexDirection: 'row' }}>
            {cells.map((cell, ci) => (
              <View key={ci} style={{
                flex: 1, padding: 5, borderRight: ci < cells.length - 1 ? '1px solid #999' : undefined,
                borderBottom: ri < rows.length - 1 ? '1px solid #999' : undefined,
                backgroundColor: cell.name === 'th' ? '#f5f5f5' : undefined,
              }}>
                <Text style={{ fontSize: 9, fontWeight: cell.name === 'th' ? 700 : 400 }}>
                  {renderInline(cell.children, {}, `${key}-${ri}-${ci}`)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function htmlToPdf(html: string): React.ReactNode[] {
  if (!html || !html.trim()) return [];
  const doc = parseDocument(html);
  const out: React.ReactNode[] = [];

  function walk(nodes: ChildNode[], keyPrefix: string) {
    nodes.forEach((n, i) => {
      const key = `${keyPrefix}-${i}`;
      if (!isElement(n)) {
        if (isText(n) && n.data.trim()) out.push(<Text key={key} style={{ fontSize: 10, marginBottom: 4 }}>{n.data}</Text>);
        return;
      }
      const tag = n.name.toLowerCase();
      if (tag === 'p') {
        const content = renderInline(n.children, {}, key);
        if (content.length === 0) { out.push(<Text key={key} style={{ height: 8 }} />); return; }
        out.push(<Text key={key} style={{ fontSize: 10, marginBottom: 6, lineHeight: 1.5 }}>{content}</Text>);
      } else if (tag === 'h1') {
        out.push(<Text key={key} style={{ fontSize: 15, fontWeight: 700, marginTop: 8, marginBottom: 5 }}>{renderInline(n.children, {}, key)}</Text>);
      } else if (tag === 'h2') {
        out.push(<Text key={key} style={{ fontSize: 12.5, fontWeight: 700, marginTop: 6, marginBottom: 4 }}>{renderInline(n.children, {}, key)}</Text>);
      } else if (tag === 'ul' || tag === 'ol') {
        const items = n.children.filter(isElement).filter(c => c.name === 'li');
        items.forEach((li, li_i) => {
          const bullet = tag === 'ul' ? '•' : `${li_i + 1}.`;
          out.push(
            <View key={`${key}-${li_i}`} style={{ flexDirection: 'row', marginBottom: 3 }}>
              <Text style={{ fontSize: 10, width: 16 }}>{bullet}</Text>
              <Text style={{ fontSize: 10, flex: 1, lineHeight: 1.5 }}>{renderInline(li.children, {}, `${key}-${li_i}`)}</Text>
            </View>
          );
        });
      } else if (tag === 'table') {
        out.push(renderTable(n, key));
      } else if (tag === 'img') {
        const src = n.attribs?.src;
        if (src) out.push(<Image key={key} src={src} style={{ maxWidth: '100%', marginVertical: 6 }} />);
      } else if (tag === 'blockquote') {
        out.push(
          <View key={key} style={{ borderLeft: '2px solid #ccc', paddingLeft: 8, marginVertical: 4 }}>
            <Text style={{ fontSize: 10, color: '#555', lineHeight: 1.5 }}>{renderInline(n.children, {}, key)}</Text>
          </View>
        );
      } else {
        walk(n.children, key);
      }
    });
  }

  walk(doc.children as ChildNode[], 'n');
  return out;
}
