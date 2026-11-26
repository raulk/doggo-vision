import { Tooltip } from "@base-ui/react/tooltip";
import { useCallback, useState } from "react";
import { CameraBlockedBanner, UrgentBanner } from "./components/Banners";
import { BottomBar } from "./components/BottomBar";
import { type DrawerTab, SettingsDrawer } from "./components/SettingsDrawer";
import { StatsPanel } from "./components/StatsPanel";
import { type MenuId, TopBar } from "./components/TopBar";
import { showToast, ToastProvider } from "./components/ui";
import { ViewportStage } from "./components/ViewportStage";
import {
	DogsightController,
	EngineContext,
	useEngine,
	useEngineSnapshot,
} from "./engine";

function DogsightShell() {
	const engine = useEngine();
	const { urgentFlags, cameraBlocked } = useEngineSnapshot();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<DrawerTab>("dog");
	const [openMenu, setOpenMenu] = useState<MenuId>(null);

	const handleOpenMenuChange = useCallback((menu: MenuId) => {
		setOpenMenu(menu);
		if (menu && matchMedia("(max-width: 700px)").matches) {
			setDrawerOpen(false);
		}
	}, []);

	const handleDrawerChange = useCallback((open: boolean) => {
		setDrawerOpen(open);
		if (open) setOpenMenu(null);
	}, []);

	const handleToggleDrawer = useCallback(() => {
		setDrawerOpen((prev) => {
			const next = !prev;
			if (next) setOpenMenu(null);
			return next;
		});
	}, []);

	const handleOpenDogTab = useCallback(() => {
		setDrawerOpen((prev) => {
			const next = !prev || activeTab !== "dog";
			if (next) {
				setOpenMenu(null);
				setActiveTab("dog");
			}
			return next;
		});
	}, [activeTab]);

	return (
		<ToastProvider drawerOpen={drawerOpen}>
			<div className={drawerOpen ? "app drawer-open" : "app"} id="app">
				<ViewportStage />
				<TopBar
					drawerOpen={drawerOpen}
					activeTab={activeTab}
					openMenu={openMenu}
					onOpenMenuChange={handleOpenMenuChange}
					onToggleDrawer={handleToggleDrawer}
					onOpenDogTab={handleOpenDogTab}
				/>
				<BottomBar />
				<StatsPanel />
				<UrgentBanner flags={urgentFlags} />
				<CameraBlockedBanner
					open={cameraBlocked}
					onClose={() => engine.dismissCameraBlocked()}
				/>
				<SettingsDrawer
					open={drawerOpen}
					activeTab={activeTab}
					onOpenChange={handleDrawerChange}
					onTabChange={setActiveTab}
				/>
			</div>
		</ToastProvider>
	);
}

export function App() {
	const [engine] = useState(
		() => new DogsightController({ onToast: showToast }),
	);

	return (
		<EngineContext.Provider value={engine}>
			<Tooltip.Provider delay={300}>
				<DogsightShell />
			</Tooltip.Provider>
		</EngineContext.Provider>
	);
}
