import path from 'path';
import { StyleSheet, Font, View, Text } from '@react-pdf/renderer';

Font.register({ family: 'NotoSansKR', src: path.join(process.cwd(), 'public/fonts/NotoSansKR.ttf') });

export const fmt = (n: number | undefined | null) => Math.round(n || 0).toLocaleString('ko-KR');

export const styles = StyleSheet.create({
  page: { fontFamily: 'NotoSansKR', padding: 32, fontSize: 9, color: '#111827' },
  titleWrap: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 700, letterSpacing: 6 },
  subtitle: { fontSize: 8, color: '#888', marginTop: 3 },
  docInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #eee' },
  docInfoGroup: { flexDirection: 'row', gap: 16 },
  docInfoItem: { flexDirection: 'row', gap: 3, marginRight: 14 },
  docInfoLabel: { color: '#888' },
  docInfoValue: { fontWeight: 700 },
  partyRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  partyBox: { flex: 1, border: '1px solid #ddd', borderRadius: 4 },
  partyHeader: { textAlign: 'center', fontWeight: 700, fontSize: 8, backgroundColor: '#f5f5f5', padding: 5, borderBottom: '1px solid #ddd', letterSpacing: 3, color: '#444' },
  partyBody: { padding: 8 },
  partyRowLine: { flexDirection: 'row', marginBottom: 3 },
  partyLabel: { color: '#888', width: 60 },
  partyValue: { fontWeight: 700, flex: 1 },
  partyName: { fontWeight: 700, fontSize: 11, flex: 1 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginTop: 4, marginBottom: 6, borderBottom: '2px solid #1e3a5f', paddingBottom: 3 },
  table: { border: '1px solid #ddd' },
  tr: { flexDirection: 'row' },
  th: { backgroundColor: '#f5f5f5', fontWeight: 700, fontSize: 8, padding: 5, borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' },
  td: { fontSize: 8, padding: 5, borderRight: '1px solid #eee', borderBottom: '1px solid #eee' },
  totalRow: { flexDirection: 'row', backgroundColor: '#f0f4ff', fontWeight: 700 },
  totalsBox: { alignSelf: 'flex-end', backgroundColor: '#f9f9f9', borderRadius: 6, padding: 14, minWidth: 220, marginTop: 12 },
  totalsLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, fontSize: 9 },
  grandTotalLine: { flexDirection: 'row', justifyContent: 'space-between', borderTop: '2px solid #ddd', paddingTop: 8, fontSize: 13, fontWeight: 700 },
  footer: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#999' },
  remarkBox: { border: '1px solid #eee', borderRadius: 4, padding: 8, marginTop: 10, fontSize: 8, color: '#555' },
});

export function PartyBox({ label, name, rows }: { label: string; name: string; rows: Array<[string, string | undefined]> }) {
  return (
    <View style={styles.partyBox}>
      <Text style={styles.partyHeader}>{label}</Text>
      <View style={styles.partyBody}>
        <View style={styles.partyRowLine}><Text style={styles.partyLabel}>상호</Text><Text style={styles.partyName}>{name}</Text></View>
        {rows.filter(([, v]) => !!v).map(([k, v]) => (
          <View style={styles.partyRowLine} key={k}><Text style={styles.partyLabel}>{k}</Text><Text style={styles.partyValue}>{v}</Text></View>
        ))}
      </View>
    </View>
  );
}
