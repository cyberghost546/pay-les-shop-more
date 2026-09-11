// src/components/RequireStaff/RequireStaff.jsx
import { Navigate, useLocation } from 'react-router-dom';
import Loading from '../Loading/Loading';
import { useAuth } from '../../auth/useAuth';

/**
 * Keeps the dashboard out of the way of people it is not for.
 *
 * Like RequireAuth, this is presentation rather than protection — the API
 * answers 403 to any account holding neither role, whatever this renders. A
 * customer who guesses the URL is sent home rather than to the login page:
 * they are already signed in, so a login form would be a dead end.
 *
 * Both roles pass here, because both have somewhere to go inside the
 * dashboard. Which pages they then see is DashboardLayout's business, and
 * which pages actually answer them is the server's.
 */
export default function RequireStaff({ children }) {
  const { isAuthenticated, isChecking, user } = useAuth();
  const location = useLocation();

  if (isChecking) return <Loading />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!user?.isStaff && !user?.isWarehouse) return <Navigate to="/" replace />;

  return children;
}
