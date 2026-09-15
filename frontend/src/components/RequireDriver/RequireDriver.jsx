// src/components/RequireDriver/RequireDriver.jsx
import { Navigate, useLocation } from 'react-router-dom';
import Loading from '../Loading/Loading';
import { useAuth } from '../../auth/useAuth';

/**
 * The guard in front of /driver: drivers, and office staff who may need to
 * record a delivery. Presentation only - the API refuses everyone else.
 */
export default function RequireDriver({ children }) {
  const { isAuthenticated, isChecking, user } = useAuth();
  const location = useLocation();

  if (isChecking) return <Loading />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (user?.role !== 'driver' && !user?.isStaff) return <Navigate to="/" replace />;

  return children;
}
