import { AppHeader } from '@/components/layout/header';

export default function Page() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="files" />
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        준비 중입니다.
      </div>
    </div>
  );
}
