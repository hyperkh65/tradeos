export interface MailProvider {
  label: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  help?: string;
}

export const PROVIDERS: Record<string, MailProvider> = {
  naver: {
    label: '네이버',
    imap_host: 'imap.naver.com',
    imap_port: 993,
    smtp_host: 'smtp.naver.com',
    smtp_port: 587,
    help: '네이버 메일 → 환경설정 → POP3/IMAP 설정에서 IMAP 사용을 켜세요.',
  },
  daum: {
    label: '다음/카카오',
    imap_host: 'imap.daum.net',
    imap_port: 993,
    smtp_host: 'smtp.daum.net',
    smtp_port: 465,
    help: '다음 메일은 별도 설정 없이 바로 연결됩니다.',
  },
  gmail: {
    label: 'Gmail',
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    help: 'Google 계정 → 보안 → 2단계 인증 활성화 후, "앱 비밀번호"를 발급해 입력하세요.',
  },
  custom: {
    label: '직접 입력',
    imap_host: '',
    imap_port: 993,
    smtp_host: '',
    smtp_port: 587,
  },
};
