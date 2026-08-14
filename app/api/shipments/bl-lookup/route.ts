import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';

// SCAC code → carrier info
const CARRIERS: Record<string, { name: string; trackingUrl: (bl: string) => string }> = {
  EGLV: { name: 'Evergreen Line', trackingUrl: bl => `https://www.evergreen-line.com/ebusiness/tracking.do?bl_no=${bl}` },
  MSCU: { name: 'MSC', trackingUrl: bl => `https://www.msc.com/track-a-shipment?bl=${bl}` },
  HLCU: { name: 'Hapag-Lloyd', trackingUrl: bl => `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${bl}` },
  COSU: { name: 'COSCO', trackingUrl: bl => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=BL&number=${bl}` },
  MAEU: { name: 'Maersk', trackingUrl: bl => `https://www.maersk.com/tracking/${bl}` },
  MSKU: { name: 'Maersk', trackingUrl: bl => `https://www.maersk.com/tracking/${bl}` },
  YMLU: { name: 'Yang Ming', trackingUrl: () => 'https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx' },
  APLU: { name: 'APL/CMA CGM', trackingUrl: bl => `https://www.apl.com/ebusiness/tracking?trackingNum=${bl}` },
  CMDU: { name: 'CMA CGM', trackingUrl: bl => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=BillOfLading&Reference=${bl}` },
  HDMU: { name: 'HMM', trackingUrl: bl => `https://www.hmm21.com/e-service/cargo/cargoTracking.do?blNo=${bl}` },
  HMMU: { name: 'HMM', trackingUrl: bl => `https://www.hmm21.com/e-service/cargo/cargoTracking.do?blNo=${bl}` },
  OOLU: { name: 'OOCL', trackingUrl: bl => `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?bno=${bl}` },
  PCIU: { name: 'Pan Ocean', trackingUrl: bl => `https://www.panocean.com/en/e-service/tracking.do?blNo=${bl}` },
  WHLC: { name: 'Wan Hai', trackingUrl: bl => `https://www.wanhai.com/views/Tracking/CargoTracking.xhtml?bl=${bl}` },
  ZIMU: { name: 'ZIM', trackingUrl: bl => `https://www.zim.com/tools/track-a-shipment?consnr=${bl}` },
  KMTC: { name: 'KMTC', trackingUrl: bl => `https://www.kmtc.co.kr/tracking?blNo=${bl}` },
  SITC: { name: 'SITC', trackingUrl: () => 'https://www.sitcline.com/en/track' },
};

const UNIPASS_STATUS: Record<string, string> = {
  '01': '선적(해외출항)', '02': '선적완료', '03': '운항중',
  '04': '입항', '05': '부두반입', '06': '하선신고',
  '07': '수입신고', '08': '수입신고수리', '09': '반출/배송',
  'E01': '수출신고', 'E02': '수출신고수리', 'E03': '적재완료',
};

// Simple XML tag extractor (no library needed)
function xmlTag(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i').exec(xml);
  return m?.[1]?.trim() || '';
}
function xmlAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

// Unipass base URL
const UNIPASS_BASE = 'https://unipass.customs.go.kr:38010/ext/rest';

function getSettings(): Record<string, string> {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('company') as { value: string } | undefined;
    if (row) return { ...JSON.parse(row.value) };
  } catch { /* ignore */ }
  return {};
}

function parseKoreanDate(dt: string): string | null {
  if (!dt || dt.length < 8) return null;
  const d = dt.replace(/[^0-9]/g, '');
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// ── 관세청 유니패스 공통 fetch ────────────────────────────────────────────────
async function unipassFetch(endpoint: string, params: Record<string, string>, apiKey: string): Promise<string> {
  const url = new URL(`${UNIPASS_BASE}/${endpoint}`);
  url.searchParams.set('crkyCn', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Unipass ${endpoint} HTTP ${res.status}`);
  return res.text();
}

// ── 1) 화물통관진행정보조회 (B/L 기준) ─────────────────────────────────────
async function queryCargoProgress(blNo: string, apiKey: string) {
  const text = await unipassFetch('cargoCsclPrgsInfoQry/retrieveCargoCsclPrgsInfo', {
    blNo, cargTp: 'B', pageIndex: '1', perPage: '20',
  }, apiKey);

  let data: any;
  try { data = JSON.parse(text); } catch {
    // XML fallback
    return {
      vessel: xmlTag(text, 'vslNm'),
      voyage: xmlTag(text, 'voyNo'),
      pol: xmlTag(text, 'ldprCd'),
      pod: xmlTag(text, 'dsprCd'),
      etd: parseKoreanDate(xmlTag(text, 'etdDt')),
      eta: parseKoreanDate(xmlTag(text, 'etprDt') || xmlTag(text, 'etaDt')),
      containerNos: xmlAllTags(text, 'cntrNo').filter(Boolean),
      statusCode: xmlTag(text, 'prcsStCd'),
      statusName: xmlTag(text, 'prcsStNm') || null,
      events: [],
    };
  }

  const root = data?.cargCsclPrgsInfoQryVo || data?.response?.body?.items || data;
  const items: any[] = Array.isArray(root?.cargCsclPrgsInfoDtlVo)
    ? root.cargCsclPrgsInfoDtlVo
    : Array.isArray(root) ? root : (root ? [root] : []);

  if (!items.length) return null;

  const first = items[0];
  const events = items.map((it: any) => ({
    date: parseKoreanDate(it.prcsDttm || it.prcsYmd || it.prcsDt || ''),
    status: it.prcsStNm || UNIPASS_STATUS[it.prcsStCd] || it.prcsStCd || '',
    location: it.dsprNm || it.ldprNm || it.cargClprSttnNm || it.prcsPrtNm || '',
    containerNo: it.cntrNo || '',
    statusCode: it.prcsStCd || '',
  })).filter((e: any) => e.date);

  const latest = items.reduce((prev: any, cur: any) =>
    (cur.prcsDttm || cur.prcsYmd || cur.prcsDt || '') > (prev.prcsDttm || prev.prcsYmd || prev.prcsDt || '') ? cur : prev, items[0]);

  const containerNos = [...new Set(items.map((it: any) => it.cntrNo).filter(Boolean))];

  // ETD: API 필드 → 출발 이벤트(03=운항중 이전) 날짜 순으로 fallback
  const etdRaw = first.etdDt || first.etd || first.shpmDt || first.ldDt || first.departureDt || '';
  const etdFromEvents = events.find(e => ['01', '02', '03'].includes(e.statusCode))?.date || null;
  const etd = parseKoreanDate(etdRaw) || etdFromEvents;

  // ETA: API 필드 → 입항 이벤트 날짜 순으로 fallback
  const etaRaw = first.etprDt || first.etaDt || first.eta || first.arrvEstDt || first.prdArvlDt || '';
  const etaFromEvents = events.find(e => ['04', '05', '06'].includes(e.statusCode))?.date || null;
  const eta = parseKoreanDate(etaRaw) || etaFromEvents;

  return {
    vessel: first.vslNm || null,
    voyage: first.voyNo || null,
    pol: first.ldprCd || null,
    pod: first.dsprCd || null,
    etd,
    eta,
    containerNos,
    containerNo: containerNos[0] || null,
    statusCode: latest.prcsStCd || null,
    statusName: latest.prcsStNm || UNIPASS_STATUS[latest.prcsStCd] || null,
    mblNo: first.mblNo || null,
    events: events.slice(0, 10),
    _firstKeys: Object.keys(first),  // 실제 응답 필드명 확인용 (디버그)
  };
}

// ── 2) 컨테이너내역조회 ────────────────────────────────────────────────────
async function queryContainer(cntrNo: string, apiKey: string) {
  try {
    const text = await unipassFetch('cntrInfoQry/retrieveCntrInfo', {
      cntrNo, pageIndex: '1', perPage: '5',
    }, apiKey);

    let data: any;
    try { data = JSON.parse(text); } catch {
      return {
        sealNo: xmlTag(text, 'sealNo'),
        cntrSzTpCd: xmlTag(text, 'cntrSzTpCd'),
        grossWeight: xmlTag(text, 'wght'),
      };
    }

    const root = data?.cntrInfoQryVo || data?.response?.body?.items || data;
    const items: any[] = Array.isArray(root?.cntrInfoDtlVo)
      ? root.cntrInfoDtlVo
      : Array.isArray(root) ? root : (root ? [root] : []);

    if (!items.length) return null;
    const c = items[0];
    return {
      sealNo: c.sealNo || null,
      cntrSzTpCd: c.cntrSzTpCd || c.cntrTpCd || null,
      grossWeight: c.wght || c.grssWght || null,
    };
  } catch { return null; }
}

// ── 3) 입항보고내역조회(해상) — vessel + voyage 기준 ─────────────────────
async function queryArrivalReport(vessel: string, voyage: string, apiKey: string): Promise<{
  eta: string | null; ata: string | null; pod: string | null; _debug?: any
} | null> {
  const tryQuery = async (params: Record<string, string>) => {
    const text = await unipassFetch('arrivRptInfoQry/retrieveArrivRptInfo', {
      ...params, pageIndex: '1', perPage: '5',
    }, apiKey);

    let data: any;
    try { data = JSON.parse(text); } catch {
      return {
        eta: parseKoreanDate(xmlTag(text, 'etprDt') || xmlTag(text, 'etaDt')),
        ata: parseKoreanDate(xmlTag(text, 'atvDt') || xmlTag(text, 'ata') || xmlTag(text, 'arrDt')),
        pod: xmlTag(text, 'dsprCd') || xmlTag(text, 'arrPrtCd'),
        _debug: { raw: text.slice(0, 300) },
      };
    }

    const root = data?.arrivRptInfoQryVo || data?.response?.body?.items || data;
    const items: any[] = Array.isArray(root?.arrivRptInfoDtlVo)
      ? root.arrivRptInfoDtlVo
      : Array.isArray(root) ? root : (root ? [root] : []);

    if (!items.length) return { eta: null, ata: null, pod: null, _debug: { empty: true, rawKeys: Object.keys(root || {}) } };
    const r = items[0];
    return {
      eta: parseKoreanDate(r.etprDt || r.etaDt || ''),
      ata: parseKoreanDate(r.atvDt || r.ata || r.arrDt || r.arrDttm || ''),
      pod: r.dsprCd || r.prtCd || r.arrPrtCd || null,
      _debug: { keys: Object.keys(r), count: items.length },
    };
  };

  try {
    // 1차: vessel + voyage
    const r1 = await tryQuery({ vslNm: vessel, voyNo: voyage });
    if (r1?.eta || r1?.ata) return r1;
    // 2차: vessel만으로 재시도 (voyage 형식 불일치 대비)
    const r2 = await tryQuery({ vslNm: vessel });
    if (r2?.eta || r2?.ata) return r2;
    return r1; // 디버그 정보는 유지
  } catch (e) {
    return { eta: null, ata: null, pod: null, _debug: { error: String(e) } };
  }
}

export async function GET(req: NextRequest) {
  const bl = req.nextUrl.searchParams.get('bl')?.trim().toUpperCase() || '';
  if (!bl || bl.length < 4) return NextResponse.json({ error: 'B/L 번호 필요' }, { status: 400 });

  const scac = bl.slice(0, 4);
  const carrier = CARRIERS[scac] || null;

  const result: Record<string, unknown> = {
    bl,
    scac,
    carrierName: carrier?.name || null,
    trackingUrl: carrier?.trackingUrl(bl) || null,
    source: null,
  };

  const settings = getSettings();
  const unipassKey1 = process.env.UNIPASS_API_KEY || settings.unipassApiKey || '';
  const unipassKey2 = settings.unipassApiKey2 || unipassKey1;
  const unipassKey3 = settings.unipassApiKey3 || unipassKey1;
  const ship24Key = process.env.SHIP24_API_KEY || settings.ship24ApiKey || '';

  // ── 1순위: 관세청 유니패스 (무료, 한국 수입 화물 전체) ─────────────────────
  if (unipassKey1) {
    try {
      // Step 1: 화물통관진행정보조회 (B/L 기준) — 키①
      const cargo = await queryCargoProgress(bl, unipassKey1);
      if (cargo) {
        Object.assign(result, cargo);
        result.source = 'unipass';
        result.sourceLabel = '관세청 유니패스';

        // Step 2: 컨테이너(키②) + 입항보고(키③) 병렬 조회
        const [cntrResult, arrResult] = await Promise.allSettled([
          cargo.containerNo ? queryContainer(cargo.containerNo, unipassKey2) : Promise.resolve(null),
          cargo.vessel && cargo.voyage ? queryArrivalReport(cargo.vessel, cargo.voyage, unipassKey3) : Promise.resolve(null),
        ]);

        if (cntrResult.status === 'fulfilled' && cntrResult.value) {
          result.containerDetail = cntrResult.value;
        }
        if (arrResult.status === 'fulfilled' && arrResult.value) {
          const arr = arrResult.value;
          if (arr.eta && !result.eta) result.eta = arr.eta;
          if (arr.ata) result.ata = arr.ata;
          if (arr.pod && !result.pod) result.pod = arr.pod;
          result._arrivalDebug = (arr as any)._debug; // 디버그용
        } else {
          result._arrivalDebug = arrResult.status === 'rejected' ? String((arrResult as any).reason) : 'skipped';
        }
      }
    } catch (e) {
      result.unipassError = String(e);
    }
  } else {
    result.unipassMissing = true;
  }

  // ── 2순위: Ship24 (유료, 글로벌) ──────────────────────────────────────────
  if (!result.source && ship24Key) {
    try {
      const s24Res = await fetch('https://api.ship24.com/public/v1/trackers', {
        method: 'POST',
        headers: { 'Authorization': `Apic-Key ${ship24Key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: bl }),
        signal: AbortSignal.timeout(10000),
      });
      if (s24Res.ok) {
        const data = await s24Res.json();
        const tracker = data?.data?.tracker;
        const shipment = tracker?.shipment;
        if (shipment) {
          if (!result.vessel) result.vessel = shipment.vessel?.name || null;
          if (!result.voyage) result.voyage = shipment.voyage || null;
          if (!result.pol) result.pol = shipment.pol?.location?.locationCode || null;
          if (!result.pod) result.pod = shipment.pod?.location?.locationCode || null;
          if (!result.etd) result.etd = shipment.etd ? String(shipment.etd).slice(0, 10) : null;
          if (!result.eta) result.eta = shipment.estimatedTimeOfArrival ? String(shipment.estimatedTimeOfArrival).slice(0, 10) : null;
          result.source = 'ship24';
          result.sourceLabel = 'Ship24';
          const evts = (tracker.events || []).slice(0, 8);
          result.events = evts.map((e: any) => ({
            date: String(e.occurrenceDatetime || '').slice(0, 10),
            location: e.location?.locationName || '',
            status: e.description || e.statusCode || '',
          }));
        }
      }
    } catch { /* ignore */ }
  }

  // ── 3순위: Searates 무료 엔드포인트 ────────────────────────────────────────
  if (!result.source) {
    try {
      const sRes = await fetch(
        `https://tracking.searates.com/api/tracking?number=${encodeURIComponent(bl)}&type=BL`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) }
      );
      if (sRes.ok) {
        const d = await sRes.json();
        if (d?.data) {
          result.vessel = d.data.vessel || null;
          result.voyage = d.data.voyage || null;
          result.pol = d.data.pol || null;
          result.pod = d.data.pod || null;
          result.etd = d.data.etd ? String(d.data.etd).slice(0, 10) : null;
          result.eta = d.data.eta ? String(d.data.eta).slice(0, 10) : null;
          result.source = 'searates';
          result.sourceLabel = 'Searates';
        }
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json(result);
}
