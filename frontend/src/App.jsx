import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header/Header';
import Hero from './components/Hero/Hero';
import ShopAndShip from './components/ShopAndShip/ShopAndShip';
import OrderCta from './components/OrderCta/OrderCta';
import Steps from './components/Steps/Steps';
import Loading from './components/Loading/Loading';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import RequireAuth from './components/RequireAuth/RequireAuth';
import LanguageSwitcher from './components/LanguageSwitcher/LanguageSwitcher';
import Footer from './components/Footer/Footer';

// Loaded on demand: each becomes its own chunk, so someone who only reads the
// home page never downloads the profile forms. On a slow connection the
// Suspense fallback below is what they see while the chunk arrives.
const Services = lazy(() => import('./pages/Services/Services'));
const Contact = lazy(() => import('./components/Contact/Contact'));
const Login = lazy(() => import('./pages/Login/Login'));
const Signup = lazy(() => import('./pages/Signup/Signup'));
const Profile = lazy(() => import('./pages/Profile/Profile'));
const Destinations = lazy(() => import('./pages/Destinations/Destinations'));
const Destination = lazy(() => import('./pages/Destination/Destination'));
const NotFound = lazy(() => import('./pages/NotFound/NotFound'));

function Home() {
  return (
    <>
      <br />
      <Hero />
      <main>
        <ShopAndShip />
        <OrderCta />
        <Steps />
      </main>
    </>
  );
}

export default function App() {
  return (
    <>
      <Header />
      {/* Boundary outside Suspense: a chunk that fails to download throws
          rather than suspending, so only the boundary can catch it. */}
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<Services />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route path="/destinations" element={<Destinations />} />
            <Route path="/destinations/:slug" element={<Destination />} />
            {/* Catch-all: an unknown URL gets a real page, not a blank one. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Footer />
      {/* Outside the routes: the rail stays put while pages change. */}
      <LanguageSwitcher />
    </>
  );
}
