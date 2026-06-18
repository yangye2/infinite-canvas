import { useCallback, useMemo, useState } from "react";
import type { ReleaseInfo } from "@/lib/release";

function readLocalReleases(): ReleaseInfo[] {
    try {
        return JSON.parse(process.env.NEXT_PUBLIC_APP_RELEASES || "[]");
    } catch {
        return [];
    }
}

export function useVersionCheck() {
    const releases = useMemo(readLocalReleases, []);
    const [open, setOpen] = useState(false);

    const openReleaseModal = useCallback(() => {
        setOpen(true);
    }, []);

    return {
        open,
        setOpen,
        openReleaseModal,
        releases,
    };
}
