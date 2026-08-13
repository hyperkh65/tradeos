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

// 관세청 cargo status codes
const UNIPASS_STATUS: Record<string, string> = {
  '01': '선적(해외출항)', '02': '선적완료', '03': '운항중',
  '04': '입항', '05': '부두반입', '06': '하선신고',
  '07': '수입신고', '08': '수입신고수리', '09': '반출/배송',
  'E01': '수출신고', 'E02': '수출신고수리', 'E03': '적재완료',
};

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

// ── 관세청 유니패스 API ──────────────────────────────────────────────────────
async function queryUnipass(blNo: string, apiKey: string) {
  const url = new URL('https://unipass.customs.go.kr:38010/ext/rest/cargoCsclPrgsInfoQry/retrieveCargoCsclPrgsInfo');
  url.searchParams.set('crkyCn', apiKey);
  url.searchParams.set('blNo', blNo);
  url.searchParams.set('cargTp', 'B');    // B=해상, A=항공
  url.searchParams.set('pageIndex', '1');
  url.searchParams.set('perPage', '20');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Unipass HTTP ${res.status}`);

  const text = await res.text();
  // Response can be XML or JSON
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // Try to parse XML
    const getTag = (tag: string) => {
      const m = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i').exec(text);
      return m?.[1]?.trim() || null;
    };
    return {
      vessel: getTag('vslNm'),
      voyage: getTag('voyNo'),
      pol: getTag('ldprCd'),
      pod: getTag('dsprCd'),
      etd: parseKoreanDate(getTag('etdDt') || ''),
      eta: parseKoreanDate(getTag('etprDt') || getTag('etaDt') || ''),
      containerNo: getTag('cntrNo'),
      statusCode: getTag('prcsStCd'),
      statusName: getTag('prcsStNm') || UNIPASS_STATUS[getTag('prcsStCd') || ''] || null,
      events: [],
    };
  }

  // Parse JSON response
  const root = data?.cargCsclPrgsInfoQryVo || data?.response?.body?.items || data;
  const items: any[] = Array.isArray(root?.cargCsclPrgsInfoDtlVo)
    ? root.cargCsclPrgsInfoDtlVo
    : Array.isArray(root) ? root : (root ? [root] : []);

  if (!items.length) return null;

  const first = items[0];

  const events = items.map((it: any) => ({
    date: parseKoreanDate(it.prcsDttm || it.prcsYmd || ''),
    status: it.prcsStNm || UNIPASS_STATUS[it.prcsStCd] || it.prcsStCd || '',
    location: it.dsprNm || it.ldprNm || it.cargClprSttnNm || '',
    containerNo: it.cntrNo || '',
  })).filter((e: any) => e.date);

  const latest = items.reduce((prev: any, cur: any) => {
    const prevDt = prev.prcsDttm || prev.prcsYmd || '';
    const curDt = cur.prcsDttm || cur.prcsYmd || '';
    return curDt > prevDt ? cur : prev;
  }, items[0]);

  return {
    vessel: first.vslNm || first.vesselName || null,
    voyage: first.voyNo || null,
    pol: first.ldprCd || null,
    pod: first.dsprCd || null,
    etd: parseKoreanDate(first.etdDt || first.shpmDttm || ''),
    eta: parseKoreanDate(first.etprDt || first.etaDt || ''),
    containerNo: first.cntrNo || null,
    statusCode: latest.prcsStCd || null,
    statusName: latest.prcsStNm || UNIPASS_STATUS[latest.prcsStCd] || null,
    mblNo: first.mblNo || null,
    events: events.slice(0, 10),
    source: 'unipass',
  };
}

// ── Port-MIS 선박 입출항 정보 ─────────────────────────────────────────────────
async function queryPortMIS(vesselName: string, apiKey: string) {
  const url = new URL('https://apis.data.go.kr/1220000/VsslScheInfoService/getVsslScheInfo');
  url.searchParams.set('serviceKey', apiKey);
  url.searchParams.set('vslNm', vesselName);
  url.searchParams.set('numOfRows', '5');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('type', 'json');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  try {
    const data = await res.json();
    const items = data?.response?.body?.items?.item;
    if (!items) return null;
    const list = Array.isArray(items) ? items : [items];
    return list.map((it: any) => ({
      vessel: it.vslNm,
      voyage: it.voyNo,
      pol: it.ldgPrtCd,
      pod: it.dschPrtCd,
      etd: parseKoreanDate(it.etd || it.atd || ''),
      eta: parseKoreanDate(it.eta || it.ata || ''),
    }));
  } catch { return null; }
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
  const unipassKey = process.env.UNIPASS_API_KEY || settings.unipassApiKey || '';
  const ship24Key = process.env.SHIP24_API_KEY || settings.ship24ApiKey || '';

  // ── 1순위: 관세청 유니패스 (무료, 한국 수입 화물 전체) ─────────────────────
  if (unipassKey) {
    try {
      const info = await queryUnipass(bl, unipassKey);
      if (info) {
        Object.assign(result, info);
        result.source = 'unipass';
        result.sourceLabel = '관세청 유니패스';
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
