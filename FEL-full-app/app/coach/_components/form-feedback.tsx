'use client';

import { Video, Camera, ArrowRight } from 'lucide-react';

export function FormFeedback() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-16">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF3366]/20 to-[#A855F7]/20 flex items-center justify-center mb-4 border border-[#FF3366]/20">
        <Video className="h-8 w-8 text-[#FF3366]" />
      </div>
      <h3 className="fel-heading text-xl text-white mb-2">Form Check</h3>
      <p className="text-white/50 text-sm max-w-md mb-6">
        Upload your training video to compare your form side-by-side with Coach Bonds&apos; demonstration.
        Get visual feedback on your technique.
      </p>

      <div className="w-full max-w-md space-y-3">
        {/* Coming soon card */}
        <div className="fel-card rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <Camera className="h-5 w-5 text-[#00E5FF]" />
            <span className="text-sm font-medium text-white">Side-by-Side Comparison</span>
          </div>
          <p className="text-xs text-white/40 mb-3">
            Record or upload your exercise form, then view it alongside the coach&apos;s demo video for self-guided feedback.
          </p>
          <div className="flex items-center gap-2 text-xs text-[#FFD700]/60">
            <ArrowRight className="h-3 w-3" />
            Coming in the next update
          </div>
        </div>

        {/* AI Analysis stub */}
        <div className="fel-card rounded-xl p-4 opacity-50">
          <div className="flex items-center gap-3 mb-3">
            <Video className="h-5 w-5 text-[#A855F7]" />
            <span className="text-sm font-medium text-white">AI Form Analysis</span>
          </div>
          <p className="text-xs text-white/40 mb-3">
            Future feature: AI-powered pose estimation will analyze your movement patterns and provide automated feedback.
          </p>
          <div className="flex items-center gap-2 text-xs text-white/20">
            <ArrowRight className="h-3 w-3" />
            Future release
          </div>
        </div>
      </div>
    </div>
  );
}
