'use client';

import { useState } from 'react';
import UsernameSearch from './username-search';
import CompetitorDashboard from './competitor-dashboard';
import type { CompetitorReport } from '@/lib/report';

type SelectedReport = {
  report: CompetitorReport;
  mode: string;
  network?: string;
};

export default function MarketIntelligence({
  initialReport,
}: {
  initialReport: CompetitorReport;
}) {
  const [selected, setSelected] = useState<SelectedReport>({
    report: initialReport,
    mode: 'historical_snapshot',
    network: 'celo-sepolia',
  });

  const [visible, setVisible] = useState(true);

  const isHistoricalDemo =
    selected.mode === 'historical_snapshot' &&
    selected.report.username.toLowerCase() === 'instagram' &&
    selected.network === 'celo-sepolia';

  const historicalProof = isHistoricalDemo;

  return (
    <>
      <UsernameSearch
        cachedUsername={initialReport.username}
        onSearchStarted={() => setVisible(false)}
        onReportUnavailable={() => setVisible(false)}
        onReportSelected={(report, mode, network) => {
          setSelected({ report, mode, network });
          setVisible(true);
        }}
      />

      {visible && (
        <CompetitorDashboard
          report={selected.report}
          historicalProof={historicalProof}
          historical={isHistoricalDemo}
        />
      )}
    </>
  );
}
