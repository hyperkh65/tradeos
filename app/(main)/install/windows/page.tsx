import { AppHeader } from '@/components/layout/header';
import { Construction } from 'lucide-react';

export default function InstallWindowsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="Windows에 설치" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-lg mx-auto w-full">
        <h1 className="text-lg font-semibold mb-4">YNK Groupware for Windows</h1>
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-800">
          <Construction className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Windows 설치파일은 아직 준비되지 않았습니다.</p>
            <p className="text-xs mt-1 text-amber-700">데스크톱 앱(Tauri) 빌드가 완료되면 이 화면에서 실제 다운로드 링크와 버전 정보를 제공합니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
