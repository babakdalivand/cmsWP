import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login       from './pages/Login';
import Dashboard   from './pages/Dashboard';
import CreateContent from './pages/CreateContent';
import ApiSettings from './pages/ApiSettings';
import MediaLibrary from './pages/MediaLibrary';
import Monitoring   from './pages/Monitoring';
import ContentList  from './pages/ContentList';
import WPPosts      from './pages/WPPosts';
import WPEditPost   from './pages/WPEditPost';
import Categories   from './pages/Categories';
import Comments     from './pages/Comments';
import BottomNav    from './components/layout/BottomNav';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return (
    <div className="min-h-screen bg-bg text-white">
      <main className="max-w-lg mx-auto">{children}</main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
        <Route path="/content" element={<ProtectedLayout><ContentList /></ProtectedLayout>} />
        <Route path="/wp-posts" element={<ProtectedLayout><WPPosts /></ProtectedLayout>} />
        <Route path="/wp-edit/:id" element={<ProtectedLayout><WPEditPost /></ProtectedLayout>} />
        <Route path="/categories" element={<ProtectedLayout><Categories /></ProtectedLayout>} />
        <Route path="/comments" element={<ProtectedLayout><Comments /></ProtectedLayout>} />
        <Route path="/create" element={<ProtectedLayout><CreateContent /></ProtectedLayout>} />
        <Route path="/settings" element={<ProtectedLayout><ApiSettings /></ProtectedLayout>} />
        <Route path="/media" element={<ProtectedLayout><MediaLibrary /></ProtectedLayout>} />
        <Route path="/monitoring" element={<ProtectedLayout><Monitoring /></ProtectedLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
