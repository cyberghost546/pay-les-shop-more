import { Suspense, lazy } from 'react';
import { Navigate, Routes, Route, useLocation, useParams } from 'react-router-dom';
import Header from './components/Header/Header';
import Loading from './components/Loading/Loading';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import RequireAuth from './components/RequireAuth/RequireAuth';
import RequireStaff from './components/RequireStaff/RequireStaff';
import RequireWarehouse from './components/RequireWarehouse/RequireWarehouse';
import LanguageSwitcher from './components/LanguageSwitcher/LanguageSwitcher';
import Footer from './components/Footer/Footer';
import { useAuth } from './auth/useAuth';

// Loaded on demand: each becomes its own chunk, so someone who only reads the
// home page never downloads the profile forms. On a slow connection the
// Suspense fallback below is what they see while the chunk arrives.
const Home = lazy(() => import('./pages/Home/Home'));
const Tracking = lazy(() => import('./pages/Tracking/Tracking'));
const Booking = lazy(() => import('./pages/Booking/Booking'));
const Services = lazy(() => import('./pages/Services/Services'));
const Contact = lazy(() => import('./components/Contact/Contact'));
const Login = lazy(() => import('./pages/Login/Login'));
const Signup = lazy(() => import('./pages/Signup/Signup'));
const Profile = lazy(() => import('./pages/Profile/Profile'));
const Destinations = lazy(() => import('./pages/Destinations/Destinations'));
const Destination = lazy(() => import('./pages/Destination/Destination'));
const ForgotPassword = lazy(
  () => import('./pages/PasswordReset/ForgotPassword'),
);
const ResetPassword = lazy(() => import('./pages/PasswordReset/ResetPassword'));
const NotFound = lazy(() => import('./pages/NotFound/NotFound'));

// The staff dashboard. Lazy like the rest, which matters more here than
// anywhere else: customers are most of the traffic and none of them will ever
// open these chunks.
const DashboardLayout = lazy(() => import('./pages/Dashboard/DashboardLayout'));
const Overview = lazy(() => import('./pages/Dashboard/Overview'));
const Quotes = lazy(() => import('./pages/Dashboard/Quotes'));
const Messages = lazy(() => import('./pages/Dashboard/Messages'));
const Packages = lazy(() => import('./pages/Dashboard/Packages'));
const Intake = lazy(() => import('./pages/Dashboard/Intake'));
const Scan = lazy(() => import('./pages/Dashboard/Scan'));
const Customers = lazy(() => import('./pages/Dashboard/Customers'));
const Bookings = lazy(() => import('./pages/Dashboard/Bookings'));
const Invoices = lazy(() => import('./pages/Dashboard/Invoices'));
const Documents = lazy(() => import('./pages/Dashboard/Documents'));
const MeasurementsList = lazy(() => import('./pages/Dashboard/MeasurementsList'));

// The warehouse dashboard. Scan and Intake above are shared with it.
const WarehouseLayout = lazy(() => import('./pages/Warehouse/WarehouseLayout'));
const WarehouseHome = lazy(() => import('./pages/Warehouse/WarehouseHome'));
const WarehouseProfile = lazy(() => import('./pages/Warehouse/WarehouseProfile'));
const ShipmentList = lazy(() => import('./pages/Warehouse/ShipmentList'));
const PackagePage = lazy(() => import('./pages/Warehouse/PackagePage'));
const MeasurementsPage = lazy(() => import('./pages/Warehouse/MeasurementsPage'));
const PackagingPage = lazy(() => import('./pages/Warehouse/PackagingPage'));
const DamagePage = lazy(() => import('./pages/Warehouse/DamagePage'));
const ActivityPage = lazy(() => import('./pages/Warehouse/ActivityPage'));
const ShipmentLabel = lazy(() => import('./pages/Warehouse/ShipmentLabel'));

/**
 * The old office addresses of the two warehouse pages, sent on to their new
 * home with the query string intact - /dashboard/intake?sheet=41 is the link
 * in every handover e-mail sent before the move.
 */
function MovedToWarehouse({ page }) {
  const { search } = useLocation();
  return <Navigate to={`/warehouse/${page}${search}`} replace />;
}

/** The warehouse's shipment pages moved to /warehouse/packages. */
function MovedToPackages() {
  const { id } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/warehouse/packages${id ? `/${id}` : ''}${search}`} replace />;
}

/**
 * /profile is the customer's page: addresses, shipments, invoices, receipts.
 * Anyone who works here - office or floor - has their own profile in the
 * warehouse shell instead, so they are sent there.
 */
function CustomerProfile() {
  const { user } = useAuth();

  if (user?.isStaff || user?.isWarehouse) {
    return <Navigate to="/warehouse/profile" replace />;
  }

  return <Profile />;
}

export default function App() {
  const { pathname } = useLocation();

  // The dashboard is an application rather than a page of the website: it
  // brings its own top bar, its own navigation and its own way out, and fills
  // the window. Leaving the site's header above it would mean two navigation
  // bars stacked on top of each other, and the marketing footer under a table
  // of shipments reads as a mistake.
  // The same goes for the warehouse's.
  const isDashboard = ['/dashboard', '/warehouse'].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );

  return (
    <>
      {!isDashboard && <Header />}
      {/* Boundary outside Suspense: a chunk that fails to download throws
          rather than suspending, so only the boundary can catch it. */}
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tracking" element={<Tracking />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/services" element={<Services />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            {/* The login page has linked here all along; until now it
                landed on the 404 page. */}
            <Route path="/forgot-password" element={<ForgotPassword />} />
            {/* Both halves of the link from the reset e-mail. They are
                opaque to the browser — the server checks them. */}
            <Route
              path="/reset-password/:uid/:token"
              element={<ResetPassword />}
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <CustomerProfile />
                </RequireAuth>
              }
            />
            {/* Outside the office guard below, which would otherwise send a
                warehouse account to /warehouse and drop the sheet it was
                linked to. RequireWarehouse at the destination checks them. */}
            <Route path="/dashboard/intake" element={<MovedToWarehouse page="intake" />} />
            <Route path="/dashboard/scan" element={<MovedToWarehouse page="scan" />} />
            {/* The back office. One guard on the parent covers every child
                route, and the layout supplies the shell they all sit in.
                Kept off /admin, which belongs to Django's own admin site. */}
            <Route
              path="/dashboard"
              element={
                <RequireStaff>
                  <DashboardLayout />
                </RequireStaff>
              }
            >
              <Route index element={<Overview />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="messages" element={<Messages />} />
              <Route path="packages" element={<Packages />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="documents" element={<Documents />} />
              <Route path="measurements" element={<MeasurementsList />} />
              <Route path="customers" element={<Customers />} />
            </Route>

            {/* The warehouse dashboard: warehouse workers, and office staff
                who need it. Drivers and customers are sent away here and
                refused by every API route behind it. */}
            <Route
              path="/warehouse"
              element={
                <RequireWarehouse>
                  <WarehouseLayout />
                </RequireWarehouse>
              }
            >
              <Route index element={<WarehouseHome />} />
              <Route path="scan" element={<Scan />} />
              <Route path="packages" element={<ShipmentList />} />
              <Route path="packages/:id" element={<PackagePage />} />
              <Route path="measurements" element={<MeasurementsPage />} />
              <Route path="packaging" element={<PackagingPage />} />
              <Route path="damage" element={<DamagePage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="profile" element={<WarehouseProfile />} />
              <Route path="intake" element={<Intake />} />
              <Route path="shipments" element={<MovedToPackages />} />
              <Route path="shipments/:id" element={<MovedToPackages />} />
            </Route>

            {/* The label prints without the warehouse shell around it. */}
            <Route
              path="/warehouse/shipments/:id/label"
              element={
                <RequireWarehouse>
                  <ShipmentLabel />
                </RequireWarehouse>
              }
            />

            <Route path="/destinations" element={<Destinations />} />
            <Route path="/destinations/:slug" element={<Destination />} />
            {/* Catch-all: an unknown URL gets a real page, not a blank one. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      {!isDashboard && <Footer />}
      {/* Outside the routes: the rail stays put while pages change. The
          dashboard is English-only, so the switcher has nothing to offer
          there. */}
      {!isDashboard && <LanguageSwitcher />}
    </>
  );
}
