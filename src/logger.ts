import pc from 'picocolors';
import { sanitizeErrorForResponse } from './utils.js';

/**
 * Check Unicode symbol support (emojis)
 * Older Windows terminals may not support emojis
 */
const supportsUnicode = (): boolean => {
  // Check environment variables that indicate Unicode support
  if (process.platform === 'win32') {
    // Windows 10+ usually supports Unicode
    return process.env.WT_SESSION !== undefined || // Windows Terminal
           process.env.TERM_PROGRAM === 'vscode' || // VS Code terminal
           process.env.CONEMU_BUILD !== undefined;  // ConEmu
  }
  // Unix-like systems usually support Unicode
  return true;
};

const useUnicode = supportsUnicode();

/**
 * Safe symbols for emoji replacement
 */
const symbols = {
  incoming: useUnicode ? '📥' : '[>]',
  notification: useUnicode ? '📢' : '[!]',
  outgoing: useUnicode ? '📤' : '[<]',
  check: useUnicode ? '✓' : '[OK]',
  cross: useUnicode ? '✗' : '[X]',
  arrow: useUnicode ? '→' : '->',
  clock: useUnicode ? '⏱' : '[T]',
  error: useUnicode ? '❌' : '[E]',
  debug: useUnicode ? '🔍' : '[D]',
  info: useUnicode ? 'ℹ' : '[I]',
  success: useUnicode ? '✅' : '[OK]',
  warning: useUnicode ? '⚠' : '[!]',
};

/**
 * Beautiful logging for MCP server
 */
export const logger = {
  /**
   * Log incoming MCP requests
   */
  request(method: string): void {
    const methodName = method.replace('tools/', '').replace('notifications/', '');
    const prefix = method.startsWith('notifications/') ? symbols.notification : symbols.incoming;
    console.log(`${pc.cyan(prefix)} ${pc.bold(pc.cyan('MCP'))} ${pc.gray(methodName)}`);
  },

  /**
   * Log notifications
   */
  notification(method: string): void {
    console.log(`${pc.magenta(symbols.notification)} ${pc.bold(pc.magenta('Notification'))} ${pc.gray(method.replace('notifications/', ''))}`);
  },

  /**
   * Log response sending
   */
  response(method: string, success: boolean = true, error?: string): void {
    if (success) {
      const methodName = method.replace('tools/', '').replace('notifications/', '');
      console.log(`${pc.green(symbols.outgoing)} ${pc.bold(pc.green('Response'))} ${pc.gray(methodName)} ${pc.green(symbols.check)}`);
    } else {
      console.log(`${pc.red(symbols.outgoing)} ${pc.bold(pc.red('Error'))} ${pc.gray(method)} ${pc.red(symbols.cross)}`);
      if (error) {
        // Sanitize error to prevent secrets leakage
        const sanitizedError = sanitizeErrorForResponse(error);
        console.log(`${pc.red(`   ${symbols.arrow}`)} ${sanitizedError}`);
      }
    }
  },

  /**
   * Log timeouts
   */
  timeout(method: string): void {
    console.log(`${pc.yellow(symbols.clock)} ${pc.bold(pc.yellow('Timeout'))} ${pc.gray(method)} ${pc.yellow('(30s)')}`);
  },

  /**
   * Log errors
   */
  error(message: string, error?: Error | unknown): void {
    console.log(`${pc.red(symbols.error)} ${pc.bold(pc.red('Error'))} ${message}`);
    if (error) {
      // Sanitize error to prevent secrets leakage
      const sanitizedError = sanitizeErrorForResponse(error);
      console.log(`${pc.red(`   ${symbols.arrow}`)} ${sanitizedError}`);
    }
  },

  /**
   * Debug logging (only in dev mode)
   */
  debug(message: string, data?: unknown): void {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.log(`${pc.gray(symbols.debug)} ${pc.bold(pc.gray('Debug'))} ${message}`);
      if (data) {
        // Sanitize data to prevent secrets leakage
        const dataStr = typeof data === 'string' 
          ? sanitizeErrorForResponse(data)
          : sanitizeErrorForResponse(JSON.stringify(data));
        const truncated = dataStr.substring(0, 200);
        console.log(`${pc.gray(`   ${symbols.arrow}`)} ${truncated}${truncated.length >= 200 ? '...' : ''}`);
      }
    }
  },

  /**
   * Info message
   */
  info(message: string): void {
    console.log(`${pc.blue(symbols.info)} ${pc.bold(pc.blue('Info'))} ${message}`);
  },

  /**
   * Success message
   */
  success(message: string): void {
    console.log(`${pc.green(symbols.success)} ${pc.bold(pc.green('Success'))} ${message}`);
  },

  /**
   * Warning
   */
  warn(message: string): void {
    console.log(`${pc.yellow(symbols.warning)} ${pc.bold(pc.yellow('Warning'))} ${message}`);
  },
};

