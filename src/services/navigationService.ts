import { AppView } from '../types';
export type { AppView };

export interface RouteState {
  view: AppView;
  params: Record<string, string>;
  fullHash: string;
}

type RouteListener = (state: RouteState) => void;

class NavigationService {
  private listeners: RouteListener[] = [];
  private currentState: RouteState;

  constructor() {
    this.currentState = this.parseHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', this.handleHashChange);
      window.addEventListener('popstate', this.handleHashChange);
    }
  }

  private parseHash(): RouteState {
    if (typeof window === 'undefined') {
      return { view: 'home', params: {}, fullHash: '#/home' };
    }

    const rawHash = window.location.hash || '#/home';
    const hashWithoutPrefix = rawHash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = hashWithoutPrefix.split('?');

    let view: AppView = 'home';
    const cleanPath = (pathPart || 'home').toLowerCase();

    if (cleanPath === 'editor' || cleanPath === 'studio') {
      view = 'editor';
    } else if (cleanPath === 'generation' || cleanPath === 'print' || cleanPath === 'imposition') {
      view = 'generation';
    } else if (cleanPath === 'catalog' || cleanPath === 'database' || cleanPath === 'articles') {
      view = 'catalog';
    } else {
      view = 'home';
    }

    const params: Record<string, string> = {};
    if (queryPart) {
      const searchParams = new URLSearchParams(queryPart);
      searchParams.forEach((val, key) => {
        params[key] = val;
      });
    }

    return {
      view,
      params,
      fullHash: rawHash,
    };
  }

  private handleHashChange = () => {
    const newState = this.parseHash();
    this.currentState = newState;
    this.listeners.forEach((listener) => {
      try {
        listener(newState);
      } catch (err) {
        console.error('Error in route listener', err);
      }
    });
  };

  public getCurrentRoute(): RouteState {
    return this.currentState;
  }

  public navigateTo(view: AppView, params: Record<string, string> = {}, replace: boolean = false): void {
    if (typeof window === 'undefined') return;

    let hash = `#/${view}`;
    const queryEntries = Object.entries(params).filter(([_, v]) => v !== undefined && v !== '');
    if (queryEntries.length > 0) {
      const searchParams = new URLSearchParams();
      queryEntries.forEach(([k, v]) => searchParams.set(k, String(v)));
      hash += `?${searchParams.toString()}`;
    }

    if (replace) {
      window.location.replace(hash);
    } else {
      if (window.location.hash !== hash) {
        window.location.hash = hash;
      }
    }

    this.currentState = this.parseHash();
    this.listeners.forEach((listener) => listener(this.currentState));
  }

  public subscribe(listener: RouteListener): () => void {
    this.listeners.push(listener);
    listener(this.currentState);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

export const navigationService = new NavigationService();
