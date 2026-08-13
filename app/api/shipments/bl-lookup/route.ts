import { NextRequest, NextResponse } from 'next/server';

// SCAC code → carrier info
const CARRIERS: Record<string, { name: string; trackingUrl: (bl: string) => string }> = {
  EGLV: { name: 'Evergreen Line', trackingUrl: bl => `https://www.evergreen-line.com/ebusiness/tracking.do?bl_no=${bl}` },
  MSCU: { name: 'MSC', trackingUrl: bl => `https://www.msc.com/track-a-shipment?bl=${bl}` },
  HLCU: { name: 'Hapag-Lloyd', trackingUrl: bl => `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${bl}` },
  COSU: { name: 'COSCO Shipping', trackingUrl: bl => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=BL&number=${bl}` },
  MAEU: { name: 'Maersk', trackingUrl: bl => `https://www.maersk.com/tracking/${bl}` },
  MSKU: { name: 'Maersk', trackingUrl: bl => `https://www.maersk.com/tracking/${bl}` },
  YMLU: { name: 'Yang Ming', trackingUrl: () => 'https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx' },
  YMLV: { name: 'Yang Ming', trackingUrl: () => 'https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx' },
  APLU: { name: 'APL / CMA CGM', trackingUrl: bl => `https://www.apl.com/ebusiness/tracking?trackingNum=${bl}` },
  CMDU: { name: 'CMA CGM', trackingUrl: bl => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=BillOfLading&Reference=${bl}` },
  HDMU: { name: 'HMM (Hyundai)', trackingUrl: bl => `https://www.hmm21.com/e-service/cargo/cargoTracking.do?blNo=${bl}` },
  HMMU: { name: 'HMM (Hyundai)', trackingUrl: bl => `https://www.hmm21.com/e-service/cargo/cargoTracking.do?blNo=${bl}` },
  OOLU: { name: 'OOCL', trackingUrl: bl => `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?bno=${bl}` },
  PCIU: { name: 'Pan Ocean', trackingUrl: bl => `https://www.panocean.com/en/e-service/tracking.do?blNo=${bl}` },
  WHLC: { name: 'Wan Hai Lines', trackingUrl: bl => `https://www.wanhai.com/views/Tracking/CargoTracking.xhtml?bl=${bl}` },
  ZIMU: { name: 'ZIM', trackingUrl: bl => `https://www.zim.com/tools/track-a-shipment?consnr=${bl}` },
  KMTC: { name: 'KMTC', trackingUrl: bl => `https://www.kmtc.co.kr/tracking?blNo=${bl}` },
  SITC: { name: 'SITC', trackingUrl: () => 'https://www.sitcline.com/en/track' },
};

// Common POL/POD port name mapping (UNLOCODE → 도시명)
const PORTS: Record<string, string> = {
  CNNGB: '닝보 (중국)', CNSHA: '상하이 (중국)', CNTAO: '칭다오 (중국)',
  CNSZX: '선전 (중국)', CNGZH: '광저우 (중국)', CNXMN: '샤먼 (중국)',
  CNTXG: '텐진 (중국)', CNLYG: '롄윈강 (중국)', CNQZH: '취안저우 (중국)',
  KRPUS: '부산 (한국)', KRINC: '인천 (한국)', KRKAN: '광양 (한국)',
  JPOSA: '오사카 (일본)', JPTYO: '도쿄 (일본)', JPNGO: '나고야 (일본)',
  USLAX: '로스앤젤레스 (미국)', USNYC: '뉴욕 (미국)', USORD: '시카고 (미국)',
  DEHAM: '함부르크 (독일)', NLRTM: '로테르담 (네덜란드)', BEANR: '앤트워프 (벨기에)',
  SGSIN: '싱가포르', MYPKG: '포트 클랑 (말레이시아)', VNSGN: '호치민 (베트남)',
  VNDAD: '다낭 (베트남)', INNSA: '뭄바이 (인도)', AEJEA: '제벨 알리 (UAE)',
};

export async function GET(req: NextRequest) {
  const bl = req.nextUrl.searchParams.get('bl')?.trim().toUpperCase() || '';
  if (!bl || bl.length < 4) return NextResponse.json({ error: 'B/L 번호 필요' }, { status: 400 });

  // Detect carrier from SCAC prefix (first 4 chars)
  const scac = bl.slice(0, 4);
  const carrier = CARRIERS[scac] || null;

  const result: Record<string, unknown> = {
    bl,
    scac,
    carrierName: carrier?.name || null,
    trackingUrl: carrier?.trackingUrl(bl) || null,
    ports: PORTS,
  };

  // Try Searates free tracking endpoint
  try {
    const searatesRes = await fetch(
      `https://tracking.searates.com/api/tracking?number=${encodeURIComponent(bl)}&type=BL`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    );
    if (searatesRes.ok) {
      const data = await searatesRes.json();
      if (data?.data) {
        const info = data.data;
        result.vessel = info.vessel || info.vesselName || null;
        result.voyage = info.voyage || null;
        result.pol = info.pol || info.portOfLoading || null;
        result.pod = info.pod || info.portOfDischarge || null;
        result.etd = info.etd || info.departureDate || null;
        result.eta = info.eta || info.arrivalDate || null;
        result.source = 'searates';
      }
    }
  } catch { /* fallback — no tracking data */ }

  return NextResponse.json(result);
}
