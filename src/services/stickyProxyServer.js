/**
 * Sticky Proxy Server
 *
 * Creates a local proxy server that maintains a single keep-alive connection
 * to the upstream rotating proxy, ensuring the same IP for all requests.
 *
 * This solves the problem of rotating proxies giving different IPs for
 * Admin API calls and browser automation.
 */

import http from 'http';
import net from 'net';
import { URL } from 'url';

export class StickyProxyServer {
  constructor(upstreamHost, upstreamPort, upstreamUsername, upstreamPassword) {
    this.upstreamHost = upstreamHost;
    this.upstreamPort = upstreamPort;
    this.upstreamAuth = Buffer.from(`${upstreamUsername}:${upstreamPassword}`).toString('base64');

    this.server = null;
    this.localPort = null;
    this.currentIP = null;

    // Keep-alive connection pool to upstream
    this.upstreamSocket = null;
    this.lastActivity = Date.now();
  }

  /**
   * Start the local proxy server
   * @returns {Promise<{host: string, port: number, url: string}>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer();

      // Handle HTTP requests (for API calls)
      this.server.on('request', (clientReq, clientRes) => {
        this.handleHttpRequest(clientReq, clientRes);
      });

      // Handle CONNECT requests (for HTTPS tunneling - browser uses this)
      this.server.on('connect', (req, clientSocket, head) => {
        this.handleConnectRequest(req, clientSocket, head);
      });

      this.server.on('error', reject);

      // Listen on random available port
      this.server.listen(0, '127.0.0.1', () => {
        this.localPort = this.server.address().port;
        const url = `http://127.0.0.1:${this.localPort}`;
        console.log(`Sticky proxy server started on ${url}`);
        resolve({
          host: '127.0.0.1',
          port: this.localPort,
          url
        });
      });
    });
  }

  /**
   * Handle HTTP requests (forward to upstream proxy)
   */
  handleHttpRequest(clientReq, clientRes) {
    const targetUrl = clientReq.url;
    const parsed = new URL(targetUrl);

    const options = {
      host: this.upstreamHost,
      port: this.upstreamPort,
      method: clientReq.method,
      path: targetUrl,
      headers: {
        ...clientReq.headers,
        'Proxy-Authorization': `Basic ${this.upstreamAuth}`,
        'Connection': 'keep-alive'
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err.message);
      clientRes.writeHead(502);
      clientRes.end('Bad Gateway');
    });

    clientReq.pipe(proxyReq);
    this.lastActivity = Date.now();
  }

  /**
   * Handle CONNECT requests (HTTPS tunneling for browser)
   */
  handleConnectRequest(req, clientSocket, head) {
    const [targetHost, targetPort] = req.url.split(':');

    // Connect to upstream proxy
    const proxySocket = net.connect(this.upstreamPort, this.upstreamHost, () => {
      // Send CONNECT request to upstream proxy with auth
      const connectReq = [
        `CONNECT ${req.url} HTTP/1.1`,
        `Host: ${req.url}`,
        `Proxy-Authorization: Basic ${this.upstreamAuth}`,
        `Connection: keep-alive`,
        '',
        ''
      ].join('\r\n');

      proxySocket.write(connectReq);
    });

    proxySocket.once('data', (data) => {
      const response = data.toString();

      if (response.includes('200')) {
        // Connection established, tell client
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

        // Pipe data between client and upstream
        proxySocket.write(head);
        proxySocket.pipe(clientSocket);
        clientSocket.pipe(proxySocket);
      } else {
        console.error('Upstream proxy rejected CONNECT:', response.split('\r\n')[0]);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
        proxySocket.end();
      }
    });

    proxySocket.on('error', (err) => {
      console.error('Proxy socket error:', err.message);
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.end();
    });

    clientSocket.on('error', (err) => {
      proxySocket.end();
    });

    this.lastActivity = Date.now();
  }

  /**
   * Get current external IP through this proxy
   */
  async getExternalIP() {
    return new Promise((resolve, reject) => {
      const options = {
        host: '127.0.0.1',
        port: this.localPort,
        method: 'GET',
        path: 'http://api.ipify.org',
        headers: { 'Connection': 'keep-alive' }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          this.currentIP = data.trim();
          resolve(this.currentIP);
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
  }

  /**
   * Stop the proxy server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('Sticky proxy server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Get proxy URL for use with HTTP clients
   */
  getProxyUrl() {
    return `http://127.0.0.1:${this.localPort}`;
  }

  /**
   * Get proxy config for browsers (no auth needed - local proxy)
   */
  getBrowserProxyConfig() {
    return {
      mode: 'http',
      host: '127.0.0.1',
      port: this.localPort,
      username: '',
      password: ''
    };
  }
}

/**
 * Create and start a sticky proxy server
 */
export async function createStickyProxy(settings) {
  const server = new StickyProxyServer(
    settings.proxyHost,
    settings.proxyPort,
    settings.proxyUsername,
    settings.proxyPassword
  );

  await server.start();

  // Get and log the IP we're using
  try {
    const ip = await server.getExternalIP();
    console.log(`Sticky proxy IP: ${ip}`);
  } catch (e) {
    console.warn('Could not determine sticky proxy IP:', e.message);
  }

  return server;
}
