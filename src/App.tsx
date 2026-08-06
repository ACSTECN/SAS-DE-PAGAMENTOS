import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthPage } from '@/pages/AuthPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { BankConnectionPage } from '@/pages/BankConnectionPage';
import { PaymentPage } from '@/pages/PaymentPage';
import { BatchUploadPage } from '@/pages/BatchUploadPage';
import { BatchDetailPage } from '@/pages/BatchDetailPage';
import { HistoryPage } from '@/pages/HistoryPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/login" element={<AuthPage />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="conexao-bancaria" element={<BankConnectionPage />} />
          <Route path="pagamentos/novo" element={<PaymentPage />} />
          <Route path="lotes/novo" element={<BatchUploadPage />} />
          <Route path="lotes/:id" element={<BatchDetailPage />} />
          <Route path="lotes" element={<HistoryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
