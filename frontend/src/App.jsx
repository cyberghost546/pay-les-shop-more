import { Routes, Route } from 'react-router-dom';
import Header from './components/Header/Header';
import Hero from './components/Hero/Hero';
import Services from './pages/Services/Services';
import Contact from './components/Contact/Contact';
import Footer from './components/Footer/Footer';

function Home() {
  return (
    <>
      <br />
      <Hero />
      <main style={{ padding: '2rem' }}></main>
    </>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/contact" element={<Contact />} />
      </Routes>
      <Footer />
    </>
  );
}
