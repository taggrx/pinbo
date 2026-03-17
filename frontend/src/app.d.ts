// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare const __GIT_TAG__: string;

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
	interface Window {
		ethereum?: any;
	}
}

export {};
