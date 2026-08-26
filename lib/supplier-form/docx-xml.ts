/**
 * 원본 DOCX의 word/document.xml을 "절대 재구성하지 않고" 문자열 단위로 수술하듯 치환하는
 * 저수준 유틸리티. fast-xml-parser로 전체 문서를 파싱→재빌드하는 방식은 실제로 테스트해본
 * 결과 극히 드물게 요소 중첩이 미묘하게 어긋나는 경우가 있어(예: <w:tab/>이 <w:r> 밖으로
 * 빠져나가는 현상 확인됨) 절대 사용하지 않는다. 대신:
 *  - 표/행/셀의 "범위"만 괄호 깊이 계산으로 원문 문자열에서 직접 찾고,
 *  - 그 범위 안의 문자열만 국소적으로 재구성하고,
 *  - 원본 문서 전체에서는 해당 범위만 slice로 잘라 갈아끼운다.
 * 나머지 99.99%의 XML은 원본 바이트를 절대 건드리지 않는다.
 */

export interface Range { start: number; end: number }

/** xml[searchStart:searchEnd) 범위 안에서 tagName의 occurrenceIndex(0-based)번째 최상위 요소를 찾는다.
 * 같은 태그가 재귀적으로 중첩되는 경우(w:tbl 안에 w:tbl 등)까지 깊이 계산으로 정확히 처리한다. */
export function findNthElement(xml: string, tagName: string, occurrenceIndex: number, searchStart = 0, searchEnd = xml.length): Range | null {
  const openRe = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'g');
  const selfCloseRe = new RegExp(`^<${tagName}(?:\\s[^>]*)?/>`);
  const closeTag = `</${tagName}>`;
  openRe.lastIndex = searchStart;

  let found = 0;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(xml)) && m.index < searchEnd) {
    const tagStart = m.index;
    // 자체 닫힘 태그(<tag .../>)는 openRe가 매치했더라도 실제로는 닫는 태그가 없다 — 건너뛴다
    const openTagText = xml.slice(tagStart, xml.indexOf('>', tagStart) + 1);
    if (openTagText.endsWith('/>')) {
      if (found === occurrenceIndex) return { start: tagStart, end: tagStart + openTagText.length };
      found++;
      openRe.lastIndex = tagStart + openTagText.length;
      continue;
    }

    // 깊이 계산으로 매칭되는 닫는 태그를 찾는다
    let depth = 1;
    let cursor = tagStart + openTagText.length;
    const innerOpenRe = new RegExp(`<${tagName}(?:\\s[^>]*)?>|</${tagName}>`, 'g');
    innerOpenRe.lastIndex = cursor;
    let closeIdx = -1;
    let im: RegExpExecArray | null;
    while ((im = innerOpenRe.exec(xml))) {
      if (im[0] === closeTag) {
        depth--;
        if (depth === 0) { closeIdx = im.index; break; }
      } else if (!im[0].endsWith('/>')) {
        depth++;
      }
    }
    if (closeIdx === -1) return null; // 짝이 안 맞음 — 안전하게 실패 처리

    const elEnd = closeIdx + closeTag.length;
    if (found === occurrenceIndex) return { start: tagStart, end: elEnd };
    found++;
    openRe.lastIndex = elEnd;
  }
  return null;
}

/** xml 범위 안에서 특정 태그의 전체 목록(占유 순서대로)을 얻는다. 자식 셀/행 개수 세기용. */
export function findAllTopLevel(xml: string, tagName: string, searchStart: number, searchEnd: number): Range[] {
  const out: Range[] = [];
  let idx = 0;
  for (;;) {
    const r = findNthElement(xml, tagName, idx, searchStart, searchEnd);
    if (!r) break;
    out.push(r);
    idx++;
  }
  return out;
}

export function xmlEscape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 셀(<w:tc>...</w:tc>) 안에서 서식 보존에 필요한 조각(tcPr/첫 pPr/첫 rPr)을 추출한다. */
export function extractCellFormatting(cellXml: string): { tcPr: string; pPr: string; rPr: string } {
  const tcPrRange = findNthElement(cellXml, 'w:tcPr', 0);
  const tcPr = tcPrRange ? cellXml.slice(tcPrRange.start, tcPrRange.end) : '';

  const pRange = findNthElement(cellXml, 'w:p', 0);
  const pXml = pRange ? cellXml.slice(pRange.start, pRange.end) : '';
  const pPrRange = pXml ? findNthElement(pXml, 'w:pPr', 0) : null;
  // pPr 안의 rPr(문단 표식용 rPr, 예: pPr/rPr)은 run 서식이 아니라 문단 자체 표식 서식이므로 그대로 pPr에 포함해 보존
  const pPr = pPrRange ? pXml.slice(pPrRange.start, pPrRange.end) : '';

  const rRange = pXml ? findNthElement(pXml, 'w:r', 0) : null;
  const rXml = rRange ? pXml.slice(rRange.start, rRange.end) : '';
  const rPrRange = rXml ? findNthElement(rXml, 'w:rPr', 0) : null;
  const rPr = rPrRange ? rXml.slice(rPrRange.start, rPrRange.end) : '';

  return { tcPr, pPr, rPr };
}

/** 여러 줄(\n 포함) 텍스트를 <w:t>...<w:br/><w:t>...</w:t> 런 내용으로 변환 */
function textToRuns(text: string): string {
  const lines = String(text ?? '').split('\n');
  return lines.map((line, i) => `<w:t xml:space="preserve">${xmlEscape(line)}</w:t>${i < lines.length - 1 ? '<w:br/>' : ''}`).join('');
}

/** 셀 서식(tcPr/pPr/rPr)을 그대로 유지한 채 텍스트만 교체한 새 <w:tc> 문자열을 만든다. */
export function buildCellWithText(fmt: { tcPr: string; pPr: string; rPr: string }, text: string): string {
  return `<w:tc>${fmt.tcPr}<w:p>${fmt.pPr}<w:r>${fmt.rPr}${textToRuns(text)}</w:r></w:p></w:tc>`;
}

/**
 * document.xml 전체에서 (표 번호 1-index, 행 인덱스 0-index, 셀 인덱스 0-index)의 텍스트를
 * 서식을 그대로 유지한 채 교체한다. tableIndex는 문서 최상위 <w:body> 아래 <w:tbl> 순서.
 */
export function replaceCellText(xml: string, tableIndex1: number, rowIndex: number, cellIndex: number, text: string): string {
  const tbl = findNthElement(xml, 'w:tbl', tableIndex1 - 1);
  if (!tbl) throw new Error(`표 ${tableIndex1}을 찾을 수 없습니다.`);
  const tr = findNthElement(xml, 'w:tr', rowIndex, tbl.start, tbl.end);
  if (!tr) throw new Error(`표 ${tableIndex1}의 행 ${rowIndex}을 찾을 수 없습니다.`);
  const tc = findNthElement(xml, 'w:tc', cellIndex, tr.start, tr.end);
  if (!tc) throw new Error(`표 ${tableIndex1} 행 ${rowIndex}의 셀 ${cellIndex}을 찾을 수 없습니다.`);

  const cellXml = xml.slice(tc.start, tc.end);
  const fmt = extractCellFormatting(cellXml);
  const newCell = buildCellWithText(fmt, text);
  return xml.slice(0, tc.start) + newCell + xml.slice(tc.end);
}

/**
 * 체크박스 글자(☐/▒) 하나만 스왑한다 — 기존 셀의 러닝 텍스트/서식은 전혀 건드리지 않고
 * 딱 그 한 글자만 치환하므로 표1처럼 라벨이 붙어있는 체크박스에 안전하다.
 */
export function toggleGlyphCheckbox(xml: string, tableIndex1: number, rowIndex: number, cellIndex: number, checked: boolean): string {
  const tbl = findNthElement(xml, 'w:tbl', tableIndex1 - 1);
  if (!tbl) throw new Error(`표 ${tableIndex1}을 찾을 수 없습니다.`);
  const tr = findNthElement(xml, 'w:tr', rowIndex, tbl.start, tbl.end);
  if (!tr) throw new Error(`표 ${tableIndex1}의 행 ${rowIndex}을 찾을 수 없습니다.`);
  const tc = findNthElement(xml, 'w:tc', cellIndex, tr.start, tr.end);
  if (!tc) throw new Error(`표 ${tableIndex1} 행 ${rowIndex}의 셀 ${cellIndex}을 찾을 수 없습니다.`);

  const cellXml = xml.slice(tc.start, tc.end);
  const target = checked ? '▒' : '☐';
  const other = checked ? '☐' : '▒';
  let newCellXml = cellXml;
  if (cellXml.includes(other)) newCellXml = cellXml.replace(other, target);
  else if (!cellXml.includes(target)) return xml; // 체크박스 문자를 못 찾음 — 안전하게 원본 유지
  if (newCellXml === cellXml) return xml;
  return xml.slice(0, tc.start) + newCellXml + xml.slice(tc.end);
}

/** 빈 확인칸에 "√"를 채우거나 지운다 (표2의 확인 칸처럼 원래 비어있는 셀용) */
export function setCheckmarkCell(xml: string, tableIndex1: number, rowIndex: number, cellIndex: number, checked: boolean, fallbackRPr = ''): string {
  const tbl = findNthElement(xml, 'w:tbl', tableIndex1 - 1);
  if (!tbl) throw new Error(`표 ${tableIndex1}을 찾을 수 없습니다.`);
  const tr = findNthElement(xml, 'w:tr', rowIndex, tbl.start, tbl.end);
  if (!tr) throw new Error(`표 ${tableIndex1}의 행 ${rowIndex}을 찾을 수 없습니다.`);
  const tc = findNthElement(xml, 'w:tc', cellIndex, tr.start, tr.end);
  if (!tc) throw new Error(`표 ${tableIndex1} 행 ${rowIndex}의 셀 ${cellIndex}을 찾을 수 없습니다.`);

  const cellXml = xml.slice(tc.start, tc.end);
  const fmt = extractCellFormatting(cellXml);
  if (!fmt.rPr && fallbackRPr) fmt.rPr = fallbackRPr;
  const newCell = buildCellWithText(fmt, checked ? '√' : '');
  return xml.slice(0, tc.start) + newCell + xml.slice(tc.end);
}

/**
 * 표 안의 특정 행(sourceRowIndex)의 서식을 그대로 복제해서, 각 셀에 values[]를 채운 새 행을
 * 만들고 insertAfterRowIndex 뒤에 삽입한다. 원본 행의 개수를 넘는 "추가 입력" 용도.
 * repeatHeader=true면 표의 0번째 행(헤더)에 w:tblHeader를 강제로 붙여 페이지 넘김 시 반복되게 한다.
 */
export function appendClonedRow(
  xml: string, tableIndex1: number, sourceRowIndex: number, insertAfterRowIndex: number,
  values: (string | null)[], repeatHeader: boolean,
): string {
  let result = xml;
  const tbl0 = findNthElement(result, 'w:tbl', tableIndex1 - 1);
  if (!tbl0) throw new Error(`표 ${tableIndex1}을 찾을 수 없습니다.`);

  if (repeatHeader) {
    const headerTr = findNthElement(result, 'w:tr', 0, tbl0.start, tbl0.end);
    if (headerTr) {
      const headerXml = result.slice(headerTr.start, headerTr.end);
      if (!headerXml.includes('w:tblHeader')) {
        const trPr = findNthElement(headerXml, 'w:trPr', 0);
        let newHeaderXml: string;
        if (trPr) {
          const trPrXml = headerXml.slice(trPr.start, trPr.end);
          const injected = trPrXml.replace('</w:trPr>', '<w:tblHeader/><w:cantSplit/></w:trPr>');
          newHeaderXml = headerXml.slice(0, trPr.start) + injected + headerXml.slice(trPr.end);
        } else {
          newHeaderXml = headerXml.replace('<w:tr>', '<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>');
        }
        result = result.slice(0, headerTr.start) + newHeaderXml + result.slice(headerTr.end);
      }
    }
  }

  const tbl = findNthElement(result, 'w:tbl', tableIndex1 - 1)!; // repeatHeader로 인해 오프셋이 바뀌었을 수 있어 재조회
  const sourceTr = findNthElement(result, 'w:tr', sourceRowIndex, tbl.start, tbl.end);
  if (!sourceTr) throw new Error(`표 ${tableIndex1}의 원본 행 ${sourceRowIndex}을 찾을 수 없습니다.`);
  const sourceRowXml = result.slice(sourceTr.start, sourceTr.end);

  const cells = findAllTopLevel(sourceRowXml, 'w:tc', 0, sourceRowXml.length);
  const newCells = cells.map((c, i) => {
    const cellXml = sourceRowXml.slice(c.start, c.end);
    const fmt = extractCellFormatting(cellXml);
    const value = values[i];
    return value === null ? cellXml : buildCellWithText(fmt, value ?? '');
  });

  // trPr(행 서식: 높이 등)은 원본 그대로 유지 + cantSplit 보장
  const trPrRange = findNthElement(sourceRowXml, 'w:trPr', 0);
  let trPrXml = trPrRange ? sourceRowXml.slice(trPrRange.start, trPrRange.end) : '<w:trPr/>';
  if (!trPrXml.includes('w:cantSplit')) {
    trPrXml = trPrXml === '<w:trPr/>' ? '<w:trPr><w:cantSplit/></w:trPr>' : trPrXml.replace('</w:trPr>', '<w:cantSplit/></w:trPr>');
  }

  const newRowXml = `<w:tr>${trPrXml}${newCells.join('')}</w:tr>`;

  const targetTbl = findNthElement(result, 'w:tbl', tableIndex1 - 1)!;
  const insertAfterTr = findNthElement(result, 'w:tr', insertAfterRowIndex, targetTbl.start, targetTbl.end);
  if (!insertAfterTr) throw new Error(`표 ${tableIndex1}의 삽입 기준 행 ${insertAfterRowIndex}을 찾을 수 없습니다.`);

  return result.slice(0, insertAfterTr.end) + newRowXml + result.slice(insertAfterTr.end);
}

function normalizeForMatch(s: string): string {
  return s.replace(/[⦁\s]/g, '');
}

/**
 * 본문 문단(표 밖) 안에서 라벨 문자열을 포함한 문단을 찾아, 그 라벨 직후에 오는 "값 런"
 * (예: "기본모델 발행기관 " 다음 런의 ": -")을 새 값으로 교체한다.
 * 이 문서는 "⦁" 불릿 / 공백 / 라벨 / ": 값"이 전부 별도의 <w:r>로 쪼개져 있어, 라벨이
 * 끝나는 시점의 "다음 런"을 값 런으로 간주해 그 서식을 재사용한다.
 */
export function replaceParagraphValueAfterPrefix(xml: string, labelText: string, newValue: string): string {
  const paragraphs = findAllTopLevel(xml, 'w:p', 0, xml.length);
  const normLabel = normalizeForMatch(labelText);
  for (const p of paragraphs) {
    const pXml = xml.slice(p.start, p.end);
    const runs = findAllTopLevel(pXml, 'w:r', 0, pXml.length);
    const runTexts = runs.map(r => {
      const rXml = pXml.slice(r.start, r.end);
      return [...rXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
    });
    const joinedNorm = normalizeForMatch(runTexts.join(''));
    if (!joinedNorm.includes(normLabel)) continue;

    // 라벨이 끝나는 런 인덱스를 찾는다 (누적 정규화 텍스트가 라벨을 포함하게 되는 시점)
    let acc = '';
    let labelEndRunIdx = -1;
    for (let i = 0; i < runTexts.length; i++) {
      acc += runTexts[i];
      if (normalizeForMatch(acc).includes(normLabel)) { labelEndRunIdx = i; break; }
    }
    if (labelEndRunIdx === -1) continue;
    const valueRunIdx = labelEndRunIdx + 1 < runs.length ? labelEndRunIdx + 1 : labelEndRunIdx;
    if (valueRunIdx >= runs.length) continue;

    const targetRunXml = pXml.slice(runs[valueRunIdx].start, runs[valueRunIdx].end);
    const rPrRange = findNthElement(targetRunXml, 'w:rPr', 0);
    const rPr = rPrRange ? targetRunXml.slice(rPrRange.start, rPrRange.end) : '';
    const newRunXml = `<w:r>${rPr}<w:t xml:space="preserve">: ${xmlEscape(newValue)}</w:t></w:r>`;

    const newPXml = pXml.slice(0, runs[valueRunIdx].start) + newRunXml + pXml.slice(runs[valueRunIdx].end);
    return xml.slice(0, p.start) + newPXml + xml.slice(p.end);
  }
  return xml; // 못 찾으면 원본 그대로 (안전한 실패)
}
