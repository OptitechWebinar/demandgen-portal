import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/client/OverviewPage'
import { CampaignDetailPage } from './pages/client/CampaignDetailPage'
import { ReportsPage } from './pages/client/ReportsPage'
import { ClientsListPage } from './pages/admin/ClientsListPage'
import { ClientDetailPage } from './pages/admin/ClientDetailPage'
import { RollupPage } from './pages/admin/RollupPage'
import { IcpBuilderPage } from './pages/admin/IcpBuilderPage'
import { ProspectingPage } from './pages/admin/ProspectingPage'
import { SequencesListPage } from './pages/admin/SequencesListPage'
import { SequenceEditorPage } from './pages/admin/SequenceEditorPage'
import { CampaignBuildPage } from './pages/admin/CampaignBuildPage'

function HomeRedirect() {
  const { profile } = useAuth()
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />
  return <OverviewPage />
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <HomeRedirect />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:id"
          element={
            <ProtectedRoute requireRole="client_user">
              <Layout>
                <CampaignDetailPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute requireRole="client_user">
              <Layout>
                <ReportsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <ClientsListPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/clients/:id"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <ClientDetailPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/rollup"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <RollupPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/clients/:id/icp"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <IcpBuilderPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/clients/:id/prospecting"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <ProspectingPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/sequences"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <SequencesListPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/sequences/:id"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <SequenceEditorPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/campaigns/:id"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <CampaignBuildPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
