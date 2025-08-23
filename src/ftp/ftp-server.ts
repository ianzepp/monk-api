import FtpServer from 'ftp-srv';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FtpAuthHandler } from './ftp-auth-handler.js';
import type { System } from '../lib/system.js';

/**
 * MonkFtpServer - FTP interface for filesystem-based API access
 * 
 * Provides a native FTP server that maps API operations to filesystem operations,
 * enabling standard Unix tools and FTP clients to work with API data.
 * 
 * Directory Structure:
 * /tenants/<name>/data/<schema>/     - Tenant data records
 * /tenants/<name>/meta/schema/       - Schema definitions  
 * /servers/                          - Server management (read-only)
 * /config/                          - Configuration access
 */
export class MonkFtpServer {
    private ftpServer: FtpServer;
    private isRunning: boolean = false;
    private ftpRoot: string;
    private authHandler: FtpAuthHandler;

    constructor(private port: number = 2121, private host: string = 'localhost') {
        // Create temporary FTP root directory
        this.ftpRoot = join(tmpdir(), 'monk-ftp-root');
        this.ensureFtpRoot();
        
        // Initialize authentication handler
        this.authHandler = new FtpAuthHandler();
        
        // Initialize FTP server with basic configuration
        this.ftpServer = new FtpServer({
            url: `ftp://${host}:${port}`,
            anonymous: false,  // Require authentication
            pasv_url: host,    // Passive mode URL
            pasv_min: 1024,    // Passive port range
            pasv_max: 1048,
            greeting: 'Welcome to Monk API FTP Interface'
            // Note: Removed log option to avoid ftp-srv logging issues
        });

        this.setupEventHandlers();
    }

    /**
     * Setup FTP server event handlers
     */
    private setupEventHandlers(): void {
        // Connection event with JWT authentication
        this.ftpServer.on('login', async (data, resolve, reject) => {
            console.log(`FTP login attempt: ${data.username}`);
            
            try {
                // Validate credentials using JWT authentication
                const system = await this.authHandler.validateLogin(data.username, data.password);
                
                if (system) {
                    // Authentication successful - create connection context
                    const connectionContext = this.authHandler.createConnectionContext(system);
                    console.log(`FTP login successful: ${data.username} for tenant ${system.getUser().domain}`);
                    
                    // Store System instance in connection data for later use
                    const connection = data.connection;
                    if (connection) {
                        (connection as any).system = connectionContext.system;
                    }
                    
                    // Resolve with root directory only (ftp-srv expects specific format)
                    resolve({ 
                        root: connectionContext.root
                    });
                } else {
                    console.log(`FTP login failed: invalid JWT token for user ${data.username}`);
                    reject(new Error('Invalid credentials or JWT token'));
                }
                
            } catch (error) {
                console.error(`FTP authentication error:`, error);
                reject(new Error('Authentication failed'));
            }
        });

        // Client connection event
        this.ftpServer.on('client-error', (data: { connection: any; context: string; error: Error }) => {
            console.error(`FTP client error:`, data.error.message);
        });

        console.log(`FTP server event handlers configured`);
    }

    /**
     * Ensure FTP root directory exists
     */
    private ensureFtpRoot(): void {
        if (!existsSync(this.ftpRoot)) {
            mkdirSync(this.ftpRoot, { recursive: true });
            console.log(`Created FTP root directory: ${this.ftpRoot}`);
        }
    }

    /**
     * Start the FTP server
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.log(`FTP server already running on port ${this.port}`);
            return;
        }

        try {
            await this.ftpServer.listen();
            this.isRunning = true;
            console.log(`FTP server started on ${this.host}:${this.port}`);
            console.log(`Connect with: ftp ${this.host} ${this.port}`);
        } catch (error) {
            console.error(`Failed to start FTP server:`, error);
            throw error;
        }
    }

    /**
     * Stop the FTP server
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            console.log(`FTP server not running`);
            return;
        }

        try {
            await this.ftpServer.close();
            this.isRunning = false;
            console.log(`FTP server stopped`);
        } catch (error) {
            console.error(`Failed to stop FTP server:`, error);
            throw error;
        }
    }

    /**
     * Get server status
     */
    getStatus(): { running: boolean; host: string; port: number } {
        return {
            running: this.isRunning,
            host: this.host,
            port: this.port
        };
    }
}

/**
 * Factory function to create FTP server instance
 */
export function createMonkFtpServer(port?: number, host?: string): MonkFtpServer {
    const ftpPort = port || Number(process.env.FTP_PORT) || 2121;
    const ftpHost = host || process.env.FTP_HOST || 'localhost';
    
    return new MonkFtpServer(ftpPort, ftpHost);
}