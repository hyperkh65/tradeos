import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';

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

const UNIPASS_BASE = 'https://unipass.customs.go.kr:38010/ext/rest';

function getSettings(): Record<string, string> {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('company') as { value: string } | undefined;
    if (row) return { ...JSON.parse(row.value) };
  } catch { /* ignore */ }
  return {};
}

function xmlTag(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i').exec(xml);
  return m?.[1]?.trim() || '';
}

function xmlAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi');
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

function parseDate(dt: string): string | null {
  if (!dt) return null;
  const d = dt.replace(/[^0-9]/g, '');
  if (d.length < 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// 유니패스 공통 fetch — Accept 헤더 없음 (API는 XML만 반환)
async function unipassFetch(endpoint: string, params: Record<string, string>, apiKey: string): Promise<string> {
  const url = new URL(`${UNIPASS_BASE}/${endpoint}`);
  url.searchParams.set('crkyCn', apiKey);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Unipass ${endpoint} HTTP ${res.status}`);
  return res.text();
}

// ── API001: 화물통관 진행정보 (mblNo + blYy 기준) ────────────────────────────
async function queryCargoProgress(blNo: string, blYy: string, apiKey: string) {
  // MBL로 먼저 시도, 실패 시 HBL로 재시도
  const tryQuery = async (params: Record<string, string>) => {
    const xml = await unipassFetch('cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo', params, apiKey);

    // 응답 필드: 공식 문서 기준
    const vessel  = xmlTag(xml, 'shipNm');     // 선박명
    const voyage  = xmlTag(xml, 'vydf');       // 항차
    const pol     = xmlTag(xml, 'ldprCd');     // 적재항코드 (POL)
    const pod     = xmlTag(xml, 'dsprCd');     // 양륙항코드 (POD)
    const eta     = parseDate(xmlTag(xml, 'etprDt'));  // 입항일자 (ETA)
    const cntrNo  = xmlTag(xml, 'cntrNo');     // 컨테이너번호
    const cargMtNo = xmlTag(xml, 'cargMtNo'); // 화물관리번호 (API020에 필요)
    const status  = xmlTag(xml, 'prgsStts') || xmlTag(xml, 'csclPrgsStts');
    const carrierCode = xmlTag(xml, 'shcoFlcoSgn');
    const carrierName = xmlTag(xml, 'shcoFlco');

    if (!vessel && !cargMtNo && !eta) return null;
    return { vessel, voyage, pol, pod, eta, cntrNo, cargMtNo, status, carrierCode, carrierName };
  };

  // 1차: MBL로 조회
  try {
    const r = await tryQuery({ mblNo: blNo, blYy });
    if (r) return r;
  } catch { /* fallthrough to HBL */ }

  // 2차: HBL로 조회
  try {
    const r = await tryQuery({ hblNo: blNo, blYy });
    if (r) return r;
  } catch { /* ignore */ }

  return null;
}

// ── API020: 컨테이너내역조회 (cargMtNo 기준) ────────────────────────────────
// 공식 엔드포인트: cntrQryBrkdQry/retrieveCntrQryBrkd, 파라미터: cargMtNo
async function queryContainerDetail(cargMtNo: string, apiKey: string) {
  try {
    const xml = await unipassFetch('cntrQryBrkdQry/retrieveCntrQryBrkd', { cargMtNo }, apiKey);
    const cntrNos = xmlAllTags(xml, 'cntrNo').filter(Boolean);
    const cntrStszCd = xmlTag(xml, 'cntrStszCd');  // 컨테이너규격코드
    const sealNo = xmlTag(xml, 'cntrSelgNo1') || xmlTag(xml, 'cntrSelgNo2') || xmlTag(xml, 'cntrSelgNo3');
    return { cntrNos, cntrStszCd, sealNo };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const bl = req.nextUrl.searchParams.get('bl')?.trim().toUpperCase() || '';
  if (!bl || bl.length < 4) return NextResponse.json({ error: 'B/L 번호 필요' }, { status: 400 });

  const scac = bl.slice(0, 4);
  const carrier = CARRIERS[scac] || null;

  const result: Record<string, unknown> = {
    bl, scac,
    carrierName: carrier?.name || null,
    trackingUrl: carrier?.trackingUrl(bl) || null,
    source: null,
  };

  const settings = getSettings();
  const unipassKey1 = process.env.UNIPASS_API_KEY || settings.unipassApiKey || '';
  const unipassKey2 = settings.unipassApiKey2 || unipassKey1;
  const ship24Key = process.env.SHIP24_API_KEY || settings.ship24ApiKey || '';

  // BL 년도: 현재 연도 사용 (전년도도 fallback으로 시도)
  const thisYear = new Date().getFullYear().toString();

  // ── 1순위: 관세청 유니패스 ───────────────────────────────────────────────────
  if (unipassKey1) {
    try {
      let cargo = await queryCargoProgress(bl, thisYear, unipassKey1);
      // 년도 불일치 대비: 전년도로 재시도
      if (!cargo) {
        cargo = await queryCargoProgress(bl, String(Number(thisYear) - 1), unipassKey1);
      }

      if (cargo) {
        result.vessel      = cargo.vessel || null;
        result.voyage      = cargo.voyage || null;
        result.pol         = cargo.pol || null;
        result.pod         = cargo.pod || null;
        result.eta         = cargo.eta || null;
        result.containerNo = cargo.cntrNo || null;
        result.statusName  = cargo.status || null;
        result.source      = 'unipass';
        result.sourceLabel = '관세청 유니패스';

        // API020: 컨테이너 상세 (cargMtNo 필요)
        if (cargo.cargMtNo) {
          const cntrDetail = await queryContainerDetail(cargo.cargMtNo, unipassKey2).catch(() => null);
          if (cntrDetail) {
            result.containerDetail = cntrDetail;
            if (!result.containerNo && cntrDetail.cntrNos?.length > 0) {
              result.containerNo = cntrDetail.cntrNos[0];
            }
          }
        }
      }
    } catch (e) {
      result.unipassError = String(e);
    }
  } else {
    result.unipassMissing = true;
  }

  // ── 2순위: Ship24 (유료, 글로벌) ─────────────────────────────────────────────
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
        const shipment = data?.data?.tracker?.shipment;
        if (shipment) {
          if (!result.vessel) result.vessel = shipment.vessel?.name || null;
          if (!result.voyage) result.voyage = shipment.voyage || null;
          if (!result.pol) result.pol = shipment.pol?.location?.locationCode || null;
          if (!result.pod) result.pod = shipment.pod?.location?.locationCode || null;
          if (!result.eta) result.eta = shipment.estimatedTimeOfArrival ? String(shipment.estimatedTimeOfArrival).slice(0, 10) : null;
          result.source = 'ship24';
          result.sourceLabel = 'Ship24';
          const evts = (data?.data?.tracker?.events || []).slice(0, 8);
          result.events = evts.map((e: any) => ({
            date: String(e.occurrenceDatetime || '').slice(0, 10),
            location: e.location?.locationName || '',
            desc: e.description || e.statusCode || '',
          }));
        }
      }
    } catch { /* ignore */ }
  }

  // ── 3순위: Searates 무료 ──────────────────────────────────────────────────────
  if (!result.source) {
    try {
      const sRes = await fetch(
        `https://tracking.searates.com/api/tracking?number=${encodeURIComponent(bl)}&type=BL`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
      );
      if (sRes.ok) {
        const d = await sRes.json();
        if (d?.data) {
          result.vessel = d.data.vessel || null;
          result.voyage = d.data.voyage || null;
          result.pol = d.data.pol || null;
          result.pod = d.data.pod || null;
          result.eta = d.data.eta ? String(d.data.eta).slice(0, 10) : null;
          result.source = 'searates';
          result.sourceLabel = 'Searates';
        }
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json(result);
}
