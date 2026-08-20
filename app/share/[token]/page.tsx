import { getDb } from '@/lib/db/sqlite';

interface Props { params: Promise<{ token: string }> }

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const db = getDb();
  const item = db.prepare('SELECT * FROM file_items WHERE share_token=?').get(token) as Record<string,unknown> | undefined;

  const isExpired = item?.share_expires_at && new Date(item.share_expires_at as string) < new Date();

  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{item && !isExpired ? (item.file_name as string) : '파일 공유'}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
          .card { background: #fff; border-radius: 16px; padding: 40px; max-width: 420px; width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; }
          .icon { font-size: 48px; margin-bottom: 16px; }
          h1 { font-size: 18px; font-weight: 600; color: #18181b; margin-bottom: 8px; word-break: break-all; }
          p { font-size: 14px; color: #71717a; margin-bottom: 24px; }
          a { display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 500; }
          a:hover { background: #1d4ed8; }
          .error { color: #ef4444; }
        `}</style>
      </head>
      <body>
        <div className="card" style={{background:'#fff',borderRadius:16,padding:40,maxWidth:420,width:'90%',boxShadow:'0 4px 24px rgba(0,0,0,0.08)',textAlign:'center',margin:'auto'}}>
          {!item || isExpired ? (
            <>
              <div style={{fontSize:48,marginBottom:16}}>🔒</div>
              <h1 style={{fontSize:18,fontWeight:600,color:'#18181b',marginBottom:8}}>
                {!item ? '링크를 찾을 수 없습니다' : '링크가 만료되었습니다'}
              </h1>
              <p style={{fontSize:14,color:'#ef4444'}}>
                {!item ? '유효하지 않은 공유 링크입니다.' : '이 공유 링크의 유효기간이 지났습니다.'}
              </p>
            </>
          ) : (
            <>
              <div style={{fontSize:48,marginBottom:16}}>
                {(item.file_type as string)?.includes('pdf') ? '📄' :
                 (item.file_type as string)?.includes('sheet') || (item.file_name as string)?.match(/\.(xlsx?|csv)$/i) ? '📊' :
                 (item.file_type as string)?.includes('word') || (item.file_name as string)?.match(/\.docx?$/i) ? '📝' : '📎'}
              </div>
              <h1 style={{fontSize:18,fontWeight:600,color:'#18181b',marginBottom:8,wordBreak:'break-all'}}>{item.file_name as string}</h1>
              <p style={{fontSize:14,color:'#71717a',marginBottom:24}}>
                {Math.round((item.file_size as number) / 1024)} KB&nbsp;·&nbsp;업로드: {item.uploaded_by as string}
              </p>
              <a href={`/api/share/${token}`} download style={{display:'inline-block',background:'#2563eb',color:'#fff',padding:'12px 28px',borderRadius:8,textDecoration:'none',fontSize:15,fontWeight:500}}>
                ⬇ 다운로드
              </a>
            </>
          )}
        </div>
      </body>
    </html>
  );
}
