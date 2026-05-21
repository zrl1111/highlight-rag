import {StrictMode, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {LandingPage} from './components/LandingPage.tsx';
import './index.css';

const DEMO_SESSION_KEY = 'pv_demo_entered';

function Root() {
  const [entered, setEntered] = useState(
    () => sessionStorage.getItem(DEMO_SESSION_KEY) === '1',
  );

  const enterDemo = () => {
    sessionStorage.setItem(DEMO_SESSION_KEY, '1');
    setEntered(true);
  };

  if (!entered) {
    return <LandingPage onEnterDemo={enterDemo} />;
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
