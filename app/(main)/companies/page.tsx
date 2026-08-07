import { AppHeader } from '@/components/layout/header';
import { DEMO_COMPANIES } from '@/lib/demo-data';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Building2, Globe, Phone, Mail, Plus, Search } from 'lucide-react';

const typeColor: Record<string, string> = {
  '공급업체': 'bg-blue-50 text-blue-700 border-blue-200',
  '고객사': 'bg-green-50 text-green-700 border-green-200',
  '포워더': 'bg-purple-50 text-purple-700 border-purple-200',
  '관세사': 'bg-orange-50 text-orange-700 border-orange-200',
  '시험기관': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  '기타': 'bg-gray-50 text-gray-600 border-gray-200',
};

export default function CompaniesPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="거래처" />
      <div className="flex-1 overflow-y-auto p-5">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="거래처 검색..." className="pl-8 h-9" />
          </div>
          <div className="flex gap-1.5">
            {['전체', '공급업체', '고객사', '포워더'].map((t) => (
              <Button key={t} variant={t === '전체' ? 'default' : 'outline'} size="sm" className="h-9 text-xs">
                {t}
              </Button>
            ))}
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto">
            <Plus className="w-4 h-4" /> 거래처 등록
          </Button>
        </div>

        {/* Company Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {DEMO_COMPANIES.map((company) => (
            <Card key={company.id} className="p-4 hover:shadow-sm transition-shadow cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono text-muted-foreground">{company.businessId}</span>
                    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${typeColor[company.type] ?? ''}`}>
                      {company.type}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-sm mt-0.5 truncate">{company.name}</h3>
                  {company.nameEn && (
                    <p className="text-xs text-muted-foreground truncate">{company.nameEn}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {company.country && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span>{company.country}</span>
                  </div>
                )}
                {company.email && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{company.email}</span>
                  </div>
                )}
                {company.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{company.phone}</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {DEMO_COMPANIES.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">아직 등록된 거래처가 없습니다.</p>
            <Button size="sm" className="mt-3 gap-1"><Plus className="w-4 h-4" /> 거래처 등록</Button>
          </div>
        )}
      </div>
    </div>
  );
}
