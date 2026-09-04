// src/components/RequireStaff/RequireStaff.jsx
import { Navigate, useLocation } from 'react-router-dom';
import Loading from '../Loading/Loading';
import { useAuth } from '../../auth/useAuth';

/**
 * Keeps the dashboard out of the way of people it is not for.
 *
 * Like RequireAuth, this is presentation rather than protection — the staff
 * API answers 403 to any account without `is_staff`, whatever this renders.
 * A customer who guesses the URL is sent home rather than to the login page:
 * they are already signed in, so a login form would be a dead end.
 */
export default function RequireStaff({ children }) {
  const { isAuthenticated, isChecking, user } = useAuth();
  const location = useLocation();

  if (isChecking) return <Loading />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!user?.isStaff) return <Navigate to="/" replace />;

  return children;
}
