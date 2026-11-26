import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";

export const toastManager = Toast.createToastManager();

export function showToast(message: string) {
	toastManager.add({ title: message, timeout: 2600 });
}

export interface ToastProviderProps {
	children: ReactNode;
	drawerOpen?: boolean;
}

export function ToastProvider({ children, drawerOpen }: ToastProviderProps) {
	return (
		<Toast.Provider toastManager={toastManager}>
			{children}
			<ToastList drawerOpen={drawerOpen} />
		</Toast.Provider>
	);
}

function ToastList({ drawerOpen }: Pick<ToastProviderProps, "drawerOpen">) {
	const { toasts } = Toast.useToastManager();

	return (
		<Toast.Portal>
			<Toast.Viewport
				className={drawerOpen ? "toast-viewport drawer-open" : "toast-viewport"}
			>
				{toasts.map((toast) => (
					<Toast.Root key={toast.id} className="toast" toast={toast}>
						<Toast.Title />
					</Toast.Root>
				))}
			</Toast.Viewport>
		</Toast.Portal>
	);
}
