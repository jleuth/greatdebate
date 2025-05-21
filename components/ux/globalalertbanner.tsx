import React from 'react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';

type GlobalAlertBannerProps = {
    alert: string;
};

const GlobalAlertBanner: React.FC<GlobalAlertBannerProps> = ({ alert }) => {
    if (!alert) return null;

    return (
        <Card className="bg-yellow-500 text-white w-xs">
            <CardContent>
                <CardTitle className="text-lg font-bold flex items-center gap-3 font-mono"> <Info/> {alert}</CardTitle>
            </CardContent>
        </Card>
    );
};

export default GlobalAlertBanner;