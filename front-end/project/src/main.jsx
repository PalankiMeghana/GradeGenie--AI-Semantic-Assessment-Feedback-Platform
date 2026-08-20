/*import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId="YOUR_GOOGLE_CLIENT_ID">
      <Auth0Provider
        domain="YOUR_AUTH0_DOMAIN"
        clientId="YOUR_AUTH0_CLIENT_ID"
        authorizationParams={{
          redirect_uri: window.location.origin
        }}
      >
        <App />
      </Auth0Provider>
    </GoogleOAuthProvider>
  </StrictMode>
);*/
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);