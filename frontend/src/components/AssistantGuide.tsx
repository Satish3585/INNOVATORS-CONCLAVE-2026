import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Headphones, Mic, MicOff, Send, Sparkles, Volume2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, type Language } from "@/contexts/LanguageContext";
import { api, recordId } from "@/lib/api";

type Topic = "welcome" | "auth" | "farmerHome" | "buyerHome" | "farms" | "crops" | "records" | "health" | "harvest" | "market" | "requirements" | "interests" | "transactions" | "profile" | "ai" | "other";
type GuideMessage = { id: number; role: "assistant" | "user"; text: string; voice?: boolean };
type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => RecognitionLike;
  webkitSpeechRecognition?: new () => RecognitionLike;
};

type GuideCopy = {
  launcher: string; title: string; page: string; intro: string; composer: string; send: string;
  voiceStart: string; voiceStop: string; listening: string; voiceUnsupported: string; voiceDenied: string;
  voiceNoSpeech: string; speak: string; guestBadge: string; guestNote: string; login: string;
  farmerSignup: string; buyerSignup: string; greeting: string; aiUnavailable: string;
  connectionError: string; speaking: string; stopSpeaking: string; you: string; close: string; suggestions: string;
  pageNames: Record<Topic, string>; tips: Record<Topic, string>; prompts: Record<Topic, [string, string]>;
};

const copy: Record<Language, GuideCopy> = {
  en: {
    launcher: "Need a hand?", title: "FarmAI Guide", page: "YOU'RE ON", intro: "I can show you what this page does, suggest the next step, or answer a question. {tip}", composer: "Ask about this page or FarmAI…", send: "Send", voiceStart: "Ask by voice", voiceStop: "Stop voice input", listening: "Listening — speak now, then review your words before sending.", voiceUnsupported: "Voice input is not supported in this browser. You can type your question instead.", voiceDenied: "Microphone access was blocked. Allow it in your browser settings, or type your question.", voiceNoSpeech: "I didn't catch that. Try again or type your question.", speak: "Read answer aloud", guestBadge: "QUICK APP HELP", guestNote: "You can get account and navigation help here without signing in. Sign in to ask FarmAI using your saved farm records.", login: "Sign in", farmerSignup: "Farmer account", buyerSignup: "Buyer account", greeting: "Hello!", aiUnavailable: "The connected FarmAI response service is unavailable right now. Here is a quick guide for this page:", connectionError: "I couldn't connect just now. You can still use the page guide above, or try again in a moment.", speaking: "Stop speaking", stopSpeaking: "Stop reading", you: "You", close: "Close FarmAI guide", suggestions: "Try asking",
    pageNames: { welcome: "FarmAI home", auth: "Sign in or create an account", farmerHome: "Farmer dashboard", buyerHome: "Buyer dashboard", farms: "Farms and fields", crops: "Crop journeys", records: "Tasks and farm records", health: "Crop health", harvest: "Harvests and produce listings", market: "Marketplace", requirements: "Buyer requirements", interests: "Interests and replies", transactions: "Transactions", profile: "Profile and preferences", ai: "FarmAI assistant", other: "FarmAI workspace" },
    tips: { welcome: "From here, create a farmer or buyer account, or sign in to continue.", auth: "Use the language menu above. Choose Farmer or Buyer when creating an account; farmers add a phone number, age and gender preference.", farmerHome: "Use the sidebar to set up farms, crops and tasks; the dashboard brings your saved activity together.", buyerHome: "Browse produce, post a sourcing requirement, compare potential matches and manage replies.", farms: "Start with a farm, then add its fields. Add crops separately to give each growing cycle its own record.", crops: "Create a crop journey for the right field and season, then keep its observations, tasks and harvest linked.", records: "Choose the record type you need, save what happened, and return here to review or update it.", health: "Record what you observed and optionally attach a photo. FarmAI can help discuss it, but this is not a diagnosis.", harvest: "Record produce you actually harvested first. You can then create a listing from that harvest and manage its availability.", market: "Filter the live listings. Farmers create offers from saved harvests; buyers can express interest. A listing is not a payment or delivery guarantee.", requirements: "Describe the crop, amount, quality and location you need, then view informational matches against active listings.", interests: "Review each request and reply from the listing or interest page. An accepted request is not a completed purchase.", transactions: "Track the recorded status and quantity here. FarmAI does not take payments or provide escrow.", profile: "Update contact details, location and language. Use the language selector at the top to switch the whole app immediately.", ai: "Ask in text or use the microphone. Select a saved crop to add context, and review any proposed action before applying it.", other: "Use the workspace menu to find farms, crops, records, marketplace, profile and support. Ask me what you want to do next." },
    prompts: { welcome: ["What can I do in FarmAI?", "How do I get started?"], auth: ["How do I create an account?", "What do I need to sign in?"], farmerHome: ["Help me understand this dashboard", "What should I set up next?"], buyerHome: ["How do I source produce here?", "What can I do next as a buyer?"], farms: ["How do I add a farm or field?", "What farm details should I record?"], crops: ["How do I track a crop journey?", "What should I record next?"], records: ["How do I create a task?", "How do I find my saved records?"], health: ["How do I record a crop-health observation?", "Can FarmAI diagnose a crop problem?"], harvest: ["How do I record a harvest?", "How do I list produce for sale?"], market: ["How do I find or filter listings?", "How can a buyer contact a farmer?"], requirements: ["How do I post a buyer requirement?", "How do I view potential matches?"], interests: ["How do I reply to an interest?", "What does an accepted request mean?"], transactions: ["How do I track a transaction?", "Can FarmAI collect payments?"], profile: ["How do I change my app language?", "What profile details can I update?"], ai: ["How do I ask about a saved crop?", "How do I use voice input?"], other: ["How do I use this page?", "What should I do next?"] },
  },
  hi: {
    launcher: "मदद चाहिए?", title: "FarmAI मार्गदर्शक", page: "आप इस पेज पर हैं", intro: "मैं इस पेज का उपयोग समझा सकता हूँ, अगला कदम बता सकता हूँ या आपके सवाल का जवाब दे सकता हूँ। {tip}", composer: "इस पेज या FarmAI के बारे में पूछें…", send: "भेजें", voiceStart: "बोलकर पूछें", voiceStop: "आवाज़ रोकें", listening: "सुन रहा हूँ — बोलें, फिर भेजने से पहले लिखे शब्द जाँच लें।", voiceUnsupported: "इस ब्राउज़र में आवाज़ से लिखना उपलब्ध नहीं है। आप अपना सवाल टाइप कर सकते हैं।", voiceDenied: "माइक्रोफ़ोन की अनुमति नहीं मिली। ब्राउज़र सेटिंग में अनुमति दें या सवाल टाइप करें।", voiceNoSpeech: "आवाज़ समझ नहीं आई। फिर से बोलें या सवाल टाइप करें।", speak: "जवाब सुनें", guestBadge: "ऐप की त्वरित मदद", guestNote: "बिना साइन इन किए खाता और ऐप नेविगेशन की मदद लें। अपने सहेजे गए खेत रिकॉर्ड के आधार पर FarmAI से पूछने के लिए साइन इन करें।", login: "साइन इन", farmerSignup: "किसान खाता", buyerSignup: "खरीदार खाता", greeting: "नमस्ते!", aiUnavailable: "FarmAI की जुड़ी हुई उत्तर सेवा अभी उपलब्ध नहीं है। इस पेज के लिए यह त्वरित मार्गदर्शिका देखें:", connectionError: "अभी कनेक्ट नहीं हो पाया। ऊपर दी गई पेज मार्गदर्शिका देखें या थोड़ी देर में फिर कोशिश करें।", speaking: "बोलना रोकें", stopSpeaking: "पढ़ना रोकें", you: "आप", close: "FarmAI मार्गदर्शक बंद करें", suggestions: "यह पूछकर देखें",
    pageNames: { welcome: "FarmAI मुखपृष्ठ", auth: "साइन इन या खाता बनाएं", farmerHome: "किसान डैशबोर्ड", buyerHome: "खरीदार डैशबोर्ड", farms: "खेत और खेत के हिस्से", crops: "फसल यात्राएँ", records: "काम और खेत रिकॉर्ड", health: "फसल स्वास्थ्य", harvest: "कटाई और उपज लिस्टिंग", market: "मार्केटप्लेस", requirements: "खरीदार की ज़रूरतें", interests: "रुचि और जवाब", transactions: "लेन-देन", profile: "प्रोफ़ाइल और प्राथमिकताएँ", ai: "FarmAI सहायक", other: "FarmAI कार्यक्षेत्र" },
    tips: { welcome: "यहाँ से किसान या खरीदार खाता बनाएं, या आगे बढ़ने के लिए साइन इन करें।", auth: "ऊपर भाषा चुनें। नया खाता बनाते समय किसान या खरीदार चुनें; किसानों को फ़ोन नंबर, उम्र और लिंग विकल्प देना होता है।", farmerHome: "साइडबार से खेत, फसल और काम सेट करें; डैशबोर्ड आपकी सहेजी गतिविधि एक साथ दिखाता है।", buyerHome: "उपज देखें, खरीद की ज़रूरत पोस्ट करें, संभावित मिलान की तुलना करें और जवाब संभालें।", farms: "पहले खेत जोड़ें, फिर उसके हिस्से जोड़ें। हर मौसम का अलग रिकॉर्ड रखने के लिए फसलें अलग से जोड़ें।", crops: "सही खेत और मौसम के लिए फसल यात्रा बनाएं, फिर उसके निरीक्षण, काम और कटाई को उसी से जोड़ें।", records: "ज़रूरी रिकॉर्ड का प्रकार चुनें, जो हुआ वह सहेजें, फिर यहाँ लौटकर देखें या अपडेट करें।", health: "अपना निरीक्षण लिखें और चाहें तो फोटो जोड़ें। FarmAI चर्चा में मदद कर सकता है, पर यह निदान नहीं है।", harvest: "पहले सचमुच काटी गई उपज दर्ज करें। फिर उसी कटाई से बिक्री सूची बनाकर उपलब्ध मात्रा संभालें।", market: "सक्रिय सूची फ़िल्टर करें। किसान सहेजी कटाई से ऑफ़र बनाते हैं; खरीदार रुचि दिखा सकते हैं। सूची भुगतान या डिलीवरी की गारंटी नहीं है।", requirements: "चाहे गई फसल, मात्रा, गुणवत्ता और स्थान बताएं, फिर सक्रिय सूचियों से जानकारी-आधारित मिलान देखें।", interests: "हर अनुरोध देखें और लिस्टिंग या रुचि पेज से जवाब दें। स्वीकार किया गया अनुरोध पूरी खरीद नहीं है।", transactions: "दर्ज स्थिति और मात्रा यहाँ ट्रैक करें। FarmAI भुगतान नहीं लेता और एस्क्रो सेवा नहीं देता।", profile: "संपर्क विवरण, स्थान और भाषा अपडेट करें। पूरी ऐप भाषा तुरंत बदलने के लिए ऊपर का भाषा चयन उपयोग करें।", ai: "टेक्स्ट में पूछें या माइक्रोफ़ोन इस्तेमाल करें। संदर्भ जोड़ने के लिए सहेजी फसल चुनें; कोई प्रस्तावित काम लागू करने से पहले जाँचें।", other: "मेनू से खेत, फसल, रिकॉर्ड, मार्केटप्लेस, प्रोफ़ाइल और सहायता खोजें। अगला काम बताएं, मैं रास्ता दिखाऊँगा।" },
    prompts: { welcome: ["FarmAI में मैं क्या कर सकता हूँ?", "शुरुआत कैसे करूँ?"], auth: ["खाता कैसे बनाऊँ?", "साइन इन के लिए क्या चाहिए?"], farmerHome: ["इस डैशबोर्ड को समझने में मदद करें", "मुझे आगे क्या सेट करना चाहिए?"], buyerHome: ["यहाँ उपज कैसे खरीदें?", "खरीदार के रूप में आगे क्या करूँ?"], farms: ["खेत या उसका हिस्सा कैसे जोड़ूँ?", "खेत की कौन-सी जानकारी दर्ज करूँ?"], crops: ["फसल यात्रा कैसे ट्रैक करूँ?", "आगे क्या रिकॉर्ड करूँ?"], records: ["काम का रिकॉर्ड कैसे बनाऊँ?", "मेरे सहेजे रिकॉर्ड कहाँ हैं?"], health: ["फसल स्वास्थ्य निरीक्षण कैसे दर्ज करूँ?", "क्या FarmAI फसल की बीमारी पहचान सकता है?"], harvest: ["कटाई कैसे दर्ज करूँ?", "उपज बिक्री के लिए कैसे सूचीबद्ध करूँ?"], market: ["सूचियाँ कैसे खोजें या फ़िल्टर करें?", "खरीदार किसान से कैसे संपर्क करे?"], requirements: ["खरीदार की ज़रूरत कैसे पोस्ट करूँ?", "संभावित मिलान कहाँ देखें?"], interests: ["रुचि अनुरोध का जवाब कैसे दूँ?", "स्वीकार किए अनुरोध का क्या मतलब है?"], transactions: ["लेन-देन कैसे ट्रैक करूँ?", "क्या FarmAI भुगतान ले सकता है?"], profile: ["ऐप की भाषा कैसे बदलूँ?", "कौन-सी प्रोफ़ाइल जानकारी बदल सकता हूँ?"], ai: ["सहेजी फसल के बारे में कैसे पूछूँ?", "आवाज़ से सवाल कैसे पूछूँ?"], other: ["इस पेज का उपयोग कैसे करूँ?", "मुझे आगे क्या करना चाहिए?"] },
  },
  kn: {
    launcher: "ಸಹಾಯ ಬೇಕೇ?", title: "FarmAI ಮಾರ್ಗದರ್ಶಿ", page: "ನೀವು ಇರುವ ಪುಟ", intro: "ಈ ಪುಟದ ಬಳಕೆಯನ್ನು ವಿವರಿಸಬಹುದು, ಮುಂದಿನ ಹಂತ ಸೂಚಿಸಬಹುದು ಅಥವಾ ನಿಮ್ಮ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಬಹುದು. {tip}", composer: "ಈ ಪುಟ ಅಥವಾ FarmAI ಬಗ್ಗೆ ಕೇಳಿ…", send: "ಕಳುಹಿಸಿ", voiceStart: "ಧ್ವನಿಯಲ್ಲಿ ಕೇಳಿ", voiceStop: "ಧ್ವನಿ ನಿಲ್ಲಿಸಿ", listening: "ಕೇಳುತ್ತಿದ್ದೇನೆ — ಮಾತನಾಡಿ, ಕಳುಹಿಸುವ ಮೊದಲು ಪಠ್ಯವನ್ನು ಪರಿಶೀಲಿಸಿ.", voiceUnsupported: "ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಇನ್‌ಪುಟ್ ಲಭ್ಯವಿಲ್ಲ. ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಟೈಪ್ ಮಾಡಬಹುದು.", voiceDenied: "ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ. ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್‌ನಲ್ಲಿ ಅನುಮತಿಸಿ ಅಥವಾ ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ.", voiceNoSpeech: "ನಿಮ್ಮ ಮಾತು ಕೇಳಿಸಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ.", speak: "ಉತ್ತರವನ್ನು ಕೇಳಿ", guestBadge: "ತ್ವರಿತ ಆಪ್ ಸಹಾಯ", guestNote: "ಸೈನ್ ಇನ್ ಮಾಡದೆ ಖಾತೆ ಮತ್ತು ಆಪ್ ನ್ಯಾವಿಗೇಷನ್ ಸಹಾಯ ಪಡೆಯಿರಿ. ಉಳಿಸಿದ ಹೊಲದ ದಾಖಲೆಗಳ ಆಧಾರದಲ್ಲಿ FarmAI ಅನ್ನು ಕೇಳಲು ಸೈನ್ ಇನ್ ಮಾಡಿ.", login: "ಸೈನ್ ಇನ್", farmerSignup: "ರೈತರ ಖಾತೆ", buyerSignup: "ಖರೀದಿದಾರರ ಖಾತೆ", greeting: "ನಮಸ್ಕಾರ!", aiUnavailable: "ಸಂಪರ್ಕಿತ FarmAI ಉತ್ತರ ಸೇವೆ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಈ ಪುಟಕ್ಕೆ ತ್ವರಿತ ಮಾರ್ಗದರ್ಶಿ:", connectionError: "ಈಗ ಸಂಪರ್ಕಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮೇಲಿನ ಪುಟ ಮಾರ್ಗದರ್ಶಿ ನೋಡಿ ಅಥವಾ ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", speaking: "ಮಾತು ನಿಲ್ಲಿಸಿ", stopSpeaking: "ಓದುವುದನ್ನು ನಿಲ್ಲಿಸಿ", you: "ನೀವು", close: "FarmAI ಮಾರ್ಗದರ್ಶಿ ಮುಚ್ಚಿ", suggestions: "ಇದನ್ನು ಕೇಳಿ",
    pageNames: { welcome: "FarmAI ಮುಖಪುಟ", auth: "ಸೈನ್ ಇನ್ ಅಥವಾ ಖಾತೆ ರಚನೆ", farmerHome: "ರೈತರ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", buyerHome: "ಖರೀದಿದಾರರ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", farms: "ಹೊಲಗಳು ಮತ್ತು ಜಮೀನಿನ ಭಾಗಗಳು", crops: "ಬೆಳೆ ಪ್ರಯಾಣಗಳು", records: "ಕೆಲಸ ಮತ್ತು ಹೊಲದ ದಾಖಲೆಗಳು", health: "ಬೆಳೆ ಆರೋಗ್ಯ", harvest: "ಕೊಯ್ಲು ಮತ್ತು ಉತ್ಪನ್ನ ಪಟ್ಟಿ", market: "ಮಾರುಕಟ್ಟೆ", requirements: "ಖರೀದಿದಾರರ ಅಗತ್ಯಗಳು", interests: "ಆಸಕ್ತಿ ಮತ್ತು ಉತ್ತರಗಳು", transactions: "ವಹಿವಾಟುಗಳು", profile: "ಪ್ರೊಫೈಲ್ ಮತ್ತು ಆದ್ಯತೆಗಳು", ai: "FarmAI ಸಹಾಯಕ", other: "FarmAI ಕಾರ್ಯಸ್ಥಳ" },
    tips: { welcome: "ಇಲ್ಲಿಂದ ರೈತ ಅಥವಾ ಖರೀದಿದಾರರ ಖಾತೆ ರಚಿಸಿ, ಅಥವಾ ಮುಂದುವರಿಸಲು ಸೈನ್ ಇನ್ ಮಾಡಿ.", auth: "ಮೇಲಿನ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ. ಖಾತೆ ರಚಿಸುವಾಗ ರೈತ ಅಥವಾ ಖರೀದಿದಾರರನ್ನು ಆಯ್ಕೆಮಾಡಿ; ರೈತರು ಫೋನ್ ಸಂಖ್ಯೆ, ವಯಸ್ಸು ಮತ್ತು ಲಿಂಗ ಆಯ್ಕೆಯನ್ನು ನೀಡಬೇಕು.", farmerHome: "ಸೈಡ್‌ಬಾರ್‌ನಲ್ಲಿ ಹೊಲಗಳು, ಬೆಳೆಗಳು ಮತ್ತು ಕೆಲಸಗಳನ್ನು ಹೊಂದಿಸಿ; ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ನಿಮ್ಮ ಉಳಿಸಿದ ಚಟುವಟಿಕೆಗಳನ್ನು ಒಟ್ಟುಗೂಡಿಸುತ್ತದೆ.", buyerHome: "ಉತ್ಪನ್ನಗಳನ್ನು ನೋಡಿ, ಖರೀದಿ ಅಗತ್ಯ ಪೋಸ್ಟ್ ಮಾಡಿ, ಹೊಂದಾಣಿಕೆಗಳನ್ನು ಹೋಲಿಸಿ ಮತ್ತು ಉತ್ತರಗಳನ್ನು ನಿರ್ವಹಿಸಿ.", farms: "ಮೊದಲು ಹೊಲ ಸೇರಿಸಿ, ನಂತರ ಅದರ ಜಮೀನಿನ ಭಾಗಗಳನ್ನು ಸೇರಿಸಿ. ಪ್ರತಿ ಋತುವಿನ ದಾಖಲೆಗೆ ಬೆಳೆಗಳನ್ನು ಪ್ರತ್ಯೇಕವಾಗಿ ಸೇರಿಸಿ.", crops: "ಸರಿಯಾದ ಹೊಲ ಮತ್ತು ಋತುವಿಗೆ ಬೆಳೆ ಪ್ರಯಾಣ ರಚಿಸಿ; ಪರಿಶೀಲನೆ, ಕೆಲಸ ಮತ್ತು ಕೊಯ್ಲನ್ನು ಅದಕ್ಕೆ ಜೋಡಿಸಿ.", records: "ಬೇಕಾದ ದಾಖಲೆಯ ಪ್ರಕಾರ ಆಯ್ಕೆ ಮಾಡಿ, ನಡೆದದ್ದನ್ನು ಉಳಿಸಿ; ನಂತರ ಇಲ್ಲಿ ಪರಿಶೀಲಿಸಿ ಅಥವಾ ನವೀಕರಿಸಿ.", health: "ನೀವು ಗಮನಿಸಿದುದನ್ನು ದಾಖಲಿಸಿ, ಬೇಕಾದರೆ ಫೋಟೋ ಸೇರಿಸಿ. FarmAI ಚರ್ಚೆಗೆ ಸಹಾಯ ಮಾಡಬಹುದು, ಆದರೆ ಇದು ರೋಗನಿರ್ಣಯವಲ್ಲ.", harvest: "ನಿಜವಾಗಿ ಕೊಯ್ಲು ಮಾಡಿದ ಉತ್ಪನ್ನವನ್ನು ಮೊದಲು ದಾಖಲಿಸಿ. ನಂತರ ಅದರಿಂದ ಮಾರಾಟ ಪಟ್ಟಿ ರಚಿಸಿ ಲಭ್ಯ ಪ್ರಮಾಣ ನಿರ್ವಹಿಸಿ.", market: "ಸಕ್ರಿಯ ಪಟ್ಟಿಗಳನ್ನು ಫಿಲ್ಟರ್ ಮಾಡಿ. ರೈತರು ಉಳಿಸಿದ ಕೊಯ್ಲಿನಿಂದ ಕೊಡುಗೆ ರಚಿಸುತ್ತಾರೆ; ಖರೀದಿದಾರರು ಆಸಕ್ತಿ ತೋರಿಸಬಹುದು. ಇದು ಪಾವತಿ ಅಥವಾ ವಿತರಣೆಯ ಭರವಸೆಯಲ್ಲ.", requirements: "ಬೇಕಾದ ಬೆಳೆ, ಪ್ರಮಾಣ, ಗುಣಮಟ್ಟ ಮತ್ತು ಸ್ಥಳವನ್ನು ತಿಳಿಸಿ; ಸಕ್ರಿಯ ಪಟ್ಟಿಗಳ ಆಧಾರದ ಮಾಹಿತಿ ಹೊಂದಾಣಿಕೆ ನೋಡಿ.", interests: "ಪ್ರತಿ ವಿನಂತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಪಟ್ಟಿ ಅಥವಾ ಆಸಕ್ತಿ ಪುಟದಿಂದ ಉತ್ತರಿಸಿ. ಒಪ್ಪಿಗೆಯಾದ ವಿನಂತಿ ಪೂರ್ಣ ಖರೀದಿ ಅಲ್ಲ.", transactions: "ದಾಖಲಾದ ಸ್ಥಿತಿ ಮತ್ತು ಪ್ರಮಾಣವನ್ನು ಇಲ್ಲಿ ಗಮನಿಸಿ. FarmAI ಪಾವತಿ ಸ್ವೀಕರಿಸುವುದಿಲ್ಲ ಅಥವಾ ಎಸ್ಕ್ರೋ ನೀಡುವುದಿಲ್ಲ.", profile: "ಸಂಪರ್ಕ ವಿವರ, ಸ್ಥಳ ಮತ್ತು ಭಾಷೆ ನವೀಕರಿಸಿ. ಸಂಪೂರ್ಣ ಆಪ್ ಭಾಷೆಯನ್ನು ತಕ್ಷಣ ಬದಲಿಸಲು ಮೇಲಿನ ಆಯ್ಕೆ ಬಳಸಿ.", ai: "ಪಠ್ಯದಲ್ಲಿ ಕೇಳಿ ಅಥವಾ ಮೈಕ್ರೊಫೋನ್ ಬಳಸಿ. ಸಂದರ್ಭಕ್ಕಾಗಿ ಉಳಿಸಿದ ಬೆಳೆ ಆಯ್ಕೆಮಾಡಿ; ಸೂಚಿಸಿದ ಕ್ರಮವನ್ನು ಅನ್ವಯಿಸುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.", other: "ಮೆನುವಿನಲ್ಲಿ ಹೊಲಗಳು, ಬೆಳೆಗಳು, ದಾಖಲೆಗಳು, ಮಾರುಕಟ್ಟೆ, ಪ್ರೊಫೈಲ್ ಮತ್ತು ಸಹಾಯವನ್ನು ಹುಡುಕಿ. ಮುಂದೇನು ಮಾಡಬೇಕೆಂದು ಕೇಳಿ." },
    prompts: { welcome: ["FarmAI ನಲ್ಲಿ ಏನು ಮಾಡಬಹುದು?", "ಹೇಗೆ ಪ್ರಾರಂಭಿಸಲಿ?"], auth: ["ಖಾತೆಯನ್ನು ಹೇಗೆ ರಚಿಸಲಿ?", "ಸೈನ್ ಇನ್ ಮಾಡಲು ಏನು ಬೇಕು?"], farmerHome: ["ಈ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ವಿವರಿಸಿ", "ಮುಂದೆ ಏನು ಹೊಂದಿಸಲಿ?"], buyerHome: ["ಇಲ್ಲಿ ಉತ್ಪನ್ನವನ್ನು ಹೇಗೆ ಖರೀದಿಸಲಿ?", "ಖರೀದಿದಾರನಾಗಿ ಮುಂದೇನು?"], farms: ["ಹೊಲ ಅಥವಾ ಜಮೀನಿನ ಭಾಗವನ್ನು ಹೇಗೆ ಸೇರಿಸಲಿ?", "ಹೊಲದ ಯಾವ ವಿವರ ದಾಖಲಿಸಲಿ?"], crops: ["ಬೆಳೆ ಪ್ರಯಾಣವನ್ನು ಹೇಗೆ ಗಮನಿಸಲಿ?", "ಮುಂದೆ ಏನು ದಾಖಲಿಸಲಿ?"], records: ["ಕೆಲಸದ ದಾಖಲೆಯನ್ನು ಹೇಗೆ ರಚಿಸಲಿ?", "ಉಳಿಸಿದ ದಾಖಲೆಗಳನ್ನು ಎಲ್ಲಿ ನೋಡಲಿ?"], health: ["ಬೆಳೆ ಆರೋಗ್ಯ ವೀಕ್ಷಣೆಯನ್ನು ಹೇಗೆ ದಾಖಲಿಸಲಿ?", "FarmAI ಬೆಳೆ ರೋಗ ಗುರುತಿಸಬಹುದೇ?"], harvest: ["ಕೊಯ್ಲನ್ನು ಹೇಗೆ ದಾಖಲಿಸಲಿ?", "ಉತ್ಪನ್ನವನ್ನು ಮಾರಾಟಕ್ಕೆ ಹೇಗೆ ಪಟ್ಟಿ ಮಾಡಲಿ?"], market: ["ಪಟ್ಟಿಗಳನ್ನು ಹೇಗೆ ಹುಡುಕಿ ಫಿಲ್ಟರ್ ಮಾಡಲಿ?", "ಖರೀದಿದಾರರು ರೈತರನ್ನು ಹೇಗೆ ಸಂಪರ್ಕಿಸಬಹುದು?"], requirements: ["ಖರೀದಿ ಅಗತ್ಯವನ್ನು ಹೇಗೆ ಪೋಸ್ಟ್ ಮಾಡಲಿ?", "ಸಂಭಾವ್ಯ ಹೊಂದಾಣಿಕೆಗಳನ್ನು ಎಲ್ಲಿ ನೋಡಲಿ?"], interests: ["ಆಸಕ್ತಿ ವಿನಂತಿಗೆ ಹೇಗೆ ಉತ್ತರಿಸಲಿ?", "ಒಪ್ಪಿಗೆಯಾದ ವಿನಂತಿಯ ಅರ್ಥವೇನು?"], transactions: ["ವಹಿವಾಟನ್ನು ಹೇಗೆ ಗಮನಿಸಲಿ?", "FarmAI ಪಾವತಿ ಸ್ವೀಕರಿಸಬಹುದೇ?"], profile: ["ಆಪ್ ಭಾಷೆಯನ್ನು ಹೇಗೆ ಬದಲಿಸಲಿ?", "ಯಾವ ಪ್ರೊಫೈಲ್ ವಿವರ ಬದಲಿಸಬಹುದು?"], ai: ["ಉಳಿಸಿದ ಬೆಳೆಯ ಬಗ್ಗೆ ಹೇಗೆ ಕೇಳಲಿ?", "ಧ್ವನಿ ಇನ್‌ಪುಟ್ ಹೇಗೆ ಬಳಸಲಿ?"], other: ["ಈ ಪುಟವನ್ನು ಹೇಗೆ ಬಳಸಲಿ?", "ಮುಂದೆ ಏನು ಮಾಡಬೇಕು?"] },
  },
  mr: {
    launcher: "मदत हवी आहे?", title: "FarmAI मार्गदर्शक", page: "तुम्ही या पानावर आहात", intro: "हे पान कसे वापरायचे ते सांगू शकतो, पुढची पायरी सुचवू शकतो किंवा तुमच्या प्रश्नाचे उत्तर देऊ शकतो. {tip}", composer: "या पानाबद्दल किंवा FarmAI बद्दल विचारा…", send: "पाठवा", voiceStart: "बोलून विचारा", voiceStop: "आवाज थांबवा", listening: "ऐकत आहे — बोला, नंतर पाठवण्यापूर्वी मजकूर तपासा.", voiceUnsupported: "या ब्राउझरमध्ये आवाजातून मजकूर उपलब्ध नाही. तुम्ही प्रश्न टाइप करू शकता.", voiceDenied: "मायक्रोफोनची परवानगी नाकारली. ब्राउझर सेटिंगमध्ये परवानगी द्या किंवा प्रश्न टाइप करा.", voiceNoSpeech: "तुमचे बोलणे समजले नाही. पुन्हा प्रयत्न करा किंवा प्रश्न टाइप करा.", speak: "उत्तर ऐका", guestBadge: "ॲपसाठी झटपट मदत", guestNote: "साइन इन न करता खाते आणि ॲप नेव्हिगेशनची मदत घ्या. जतन केलेल्या शेत नोंदींवर आधारित FarmAI ला विचारण्यासाठी साइन इन करा.", login: "साइन इन", farmerSignup: "शेतकरी खाते", buyerSignup: "खरेदीदार खाते", greeting: "नमस्कार!", aiUnavailable: "FarmAI ची जोडलेली उत्तर सेवा सध्या उपलब्ध नाही. या पानासाठी झटपट मार्गदर्शक:", connectionError: "आत्ता जोडता आले नाही. वरचे पान मार्गदर्शक पाहा किंवा थोड्या वेळाने पुन्हा प्रयत्न करा.", speaking: "बोलणे थांबवा", stopSpeaking: "वाचणे थांबवा", you: "तुम्ही", close: "FarmAI मार्गदर्शक बंद करा", suggestions: "हे विचारून पाहा",
    pageNames: { welcome: "FarmAI मुख्यपृष्ठ", auth: "साइन इन किंवा खाते तयार करा", farmerHome: "शेतकरी डॅशबोर्ड", buyerHome: "खरेदीदार डॅशबोर्ड", farms: "शेत आणि शेताचे विभाग", crops: "पीक प्रवास", records: "कामे आणि शेत नोंदी", health: "पीक आरोग्य", harvest: "कापणी आणि उत्पादन यादी", market: "मार्केटप्लेस", requirements: "खरेदीदाराच्या गरजा", interests: "स्वारस्य आणि उत्तरे", transactions: "व्यवहार", profile: "प्रोफाइल आणि प्राधान्ये", ai: "FarmAI सहाय्यक", other: "FarmAI कार्यक्षेत्र" },
    tips: { welcome: "इथून शेतकरी किंवा खरेदीदार खाते तयार करा, किंवा पुढे जाण्यासाठी साइन इन करा.", auth: "वरची भाषा निवडा. खाते तयार करताना शेतकरी किंवा खरेदीदार निवडा; शेतकऱ्यांनी फोन नंबर, वय आणि लिंगाचा पर्याय द्यावा.", farmerHome: "साइडबारमधून शेत, पिके आणि कामे तयार करा; डॅशबोर्ड तुमच्या जतन केलेल्या नोंदी एकत्र दाखवतो.", buyerHome: "उत्पादन पाहा, खरेदीची गरज नोंदवा, संभाव्य जुळण्या तपासा आणि उत्तरे हाताळा.", farms: "आधी शेत जोडा, मग त्याचे विभाग जोडा. प्रत्येक हंगामाची स्वतंत्र नोंद ठेवण्यासाठी पिके वेगळी जोडा.", crops: "योग्य शेत आणि हंगामासाठी पीक प्रवास तयार करा; निरीक्षणे, कामे आणि कापणी त्याच्याशी जोडा.", records: "हवी ती नोंद निवडा, झालेले काम जतन करा आणि येथे परत येऊन तपासा किंवा अद्ययावत करा.", health: "तुमचे निरीक्षण नोंदवा आणि हवे असल्यास फोटो जोडा. FarmAI चर्चा करण्यास मदत करू शकतो; हे निदान नाही.", harvest: "प्रत्यक्ष कापणी केलेले उत्पादन आधी नोंदवा. मग त्या नोंदीतून विक्री यादी बनवा आणि उपलब्धता हाताळा.", market: "सक्रिय याद्या फिल्टर करा. शेतकरी जतन केलेल्या कापणीतून ऑफर तयार करतात; खरेदीदार स्वारस्य दाखवू शकतात. यादी म्हणजे पैसे किंवा वितरणाची हमी नाही.", requirements: "हवे असलेले पीक, प्रमाण, दर्जा आणि ठिकाण सांगा; सक्रिय याद्यांशी माहितीपर जुळण्या पाहा.", interests: "प्रत्येक विनंती तपासा आणि यादी किंवा स्वारस्य पानावरून उत्तर द्या. स्वीकारलेली विनंती म्हणजे पूर्ण खरेदी नाही.", transactions: "नोंदवलेली स्थिती आणि प्रमाण येथे पाहा. FarmAI पैसे घेत नाही किंवा एस्क्रो सेवा देत नाही.", profile: "संपर्क तपशील, ठिकाण आणि भाषा बदला. संपूर्ण ॲपची भाषा लगेच बदलण्यासाठी वरचा भाषा पर्याय वापरा.", ai: "मजकूराने विचारा किंवा मायक्रोफोन वापरा. संदर्भासाठी जतन केलेले पीक निवडा; सुचवलेली कृती लागू करण्यापूर्वी तपासा.", other: "मेनूमधून शेत, पिके, नोंदी, मार्केटप्लेस, प्रोफाइल आणि मदत शोधा. पुढे काय करायचे ते विचारा." },
    prompts: { welcome: ["FarmAI मध्ये मी काय करू शकतो?", "सुरुवात कशी करू?"], auth: ["खाते कसे तयार करू?", "साइन इनसाठी काय लागेल?"], farmerHome: ["हा डॅशबोर्ड समजावून सांगा", "पुढे काय तयार करू?"], buyerHome: ["इथे उत्पादन कसे खरेदी करू?", "खरेदीदार म्हणून पुढे काय?"], farms: ["शेत किंवा विभाग कसा जोडू?", "शेताची कोणती माहिती नोंदवू?"], crops: ["पीक प्रवास कसा पाहू?", "पुढे काय नोंदवू?"], records: ["कामाची नोंद कशी तयार करू?", "जतन केलेल्या नोंदी कुठे पाहू?"], health: ["पीक आरोग्य निरीक्षण कसे नोंदवू?", "FarmAI पीक रोग ओळखू शकतो का?"], harvest: ["कापणीची नोंद कशी करू?", "उत्पादन विक्रीसाठी कसे सूचीबद्ध करू?"], market: ["याद्या कशा शोधू किंवा फिल्टर करू?", "खरेदीदार शेतकऱ्याशी कसा संपर्क करेल?"], requirements: ["खरेदीची गरज कशी नोंदवू?", "संभाव्य जुळण्या कुठे पाहू?"], interests: ["स्वारस्याला उत्तर कसे देऊ?", "स्वीकारलेल्या विनंतीचा अर्थ काय?"], transactions: ["व्यवहार कसा पाहू?", "FarmAI पेमेंट घेऊ शकतो का?"], profile: ["ॲपची भाषा कशी बदलू?", "प्रोफाइलमध्ये कोणते तपशील बदलू शकतो?"], ai: ["जतन केलेल्या पिकाबद्दल कसे विचारू?", "आवाजातून प्रश्न कसा विचारू?"], other: ["हे पान कसे वापरू?", "पुढे काय करावे?"] },
  },
};

type ExtraPage = "weather" | "schemes" | "notifications" | "history" | "performance";
type ExtraPageHelp = { name: string; tip: string; prompts: [string, string] };
const extraPageHelp: Record<Language, Record<ExtraPage, ExtraPageHelp>> = {
  en: {
    weather: { name: "Weather", tip: "View weather for your saved location. If data is missing or marked unavailable, do not treat it as a forecast; update your location in Profile.", prompts: ["How do I set my location?", "Why is weather data unavailable?"] },
    schemes: { name: "Schemes and support", tip: "Browse verified support programs and open the official source to check eligibility and deadlines. FarmAI cannot guarantee eligibility.", prompts: ["How do I check scheme eligibility?", "Where can I find official application details?"] },
    notifications: { name: "Notifications", tip: "Review account and activity notices here. Open a related record to take action; reading a notice does not change farm data.", prompts: ["How do I open the related record?", "How do I mark notifications as read?"] },
    history: { name: "Activity history", tip: "Review the changes and activity recorded for your account. Use the related page to edit an item; history entries are not proof that an outside action happened.", prompts: ["How do I find a past record?", "Can I edit a history entry?"] },
    performance: { name: "Farm performance", tip: "This page summarizes information saved in your FarmAI records. It is a historical overview, not a yield or income guarantee.", prompts: ["What records appear in this summary?", "How do I improve my dashboard data?"] },
  },
  hi: {
    weather: { name: "मौसम", tip: "अपने सहेजे गए स्थान का मौसम देखें। डेटा न हो या अनुपलब्ध दिखे तो उसे पूर्वानुमान न मानें; प्रोफ़ाइल में स्थान अपडेट करें।", prompts: ["अपना स्थान कैसे सेट करूँ?", "मौसम की जानकारी क्यों उपलब्ध नहीं है?"] },
    schemes: { name: "योजनाएँ और सहायता", tip: "सत्यापित सहायता योजनाएँ देखें और पात्रता व अंतिम तारीख के लिए आधिकारिक स्रोत खोलें। FarmAI पात्रता की गारंटी नहीं देता।", prompts: ["योजना की पात्रता कैसे जाँचूँ?", "आवेदन की आधिकारिक जानकारी कहाँ मिलेगी?"] },
    notifications: { name: "सूचनाएँ", tip: "यहाँ खाते और गतिविधि की सूचनाएँ देखें। अगला कदम उठाने के लिए संबंधित रिकॉर्ड खोलें; सूचना पढ़ने से खेत का डेटा नहीं बदलता।", prompts: ["संबंधित रिकॉर्ड कैसे खोलूँ?", "सूचनाओं को पढ़ा हुआ कैसे चिह्नित करूँ?"] },
    history: { name: "गतिविधि इतिहास", tip: "अपने खाते की दर्ज गतिविधियाँ और बदलाव देखें। किसी चीज़ को संपादित करने के लिए संबंधित पेज खोलें; इतिहास यह प्रमाण नहीं कि बाहरी काम हो गया।", prompts: ["पुराना रिकॉर्ड कैसे ढूँढूँ?", "क्या इतिहास की प्रविष्टि बदल सकता हूँ?"] },
    performance: { name: "खेत का प्रदर्शन", tip: "यह पेज आपके FarmAI रिकॉर्ड में सहेजी जानकारी का सार देता है। यह पिछली जानकारी है, उपज या आय की गारंटी नहीं।", prompts: ["इस सारांश में कौन-से रिकॉर्ड आते हैं?", "डैशबोर्ड का डेटा कैसे बेहतर करूँ?"] },
  },
  kn: {
    weather: { name: "ಹವಾಮಾನ", tip: "ಉಳಿಸಿದ ಸ್ಥಳದ ಹವಾಮಾನ ನೋಡಿ. ಮಾಹಿತಿ ಇಲ್ಲದಿದ್ದರೆ ಅಥವಾ ಲಭ್ಯವಿಲ್ಲವೆಂದಿದ್ದರೆ ಅದನ್ನು ಮುನ್ಸೂಚನೆ ಎಂದು ಭಾವಿಸಬೇಡಿ; ಪ್ರೊಫೈಲ್‌ನಲ್ಲಿ ಸ್ಥಳ ನವೀಕರಿಸಿ.", prompts: ["ನನ್ನ ಸ್ಥಳವನ್ನು ಹೇಗೆ ಹೊಂದಿಸಲಿ?", "ಹವಾಮಾನ ಮಾಹಿತಿ ಏಕೆ ಲಭ್ಯವಿಲ್ಲ?"] },
    schemes: { name: "ಯೋಜನೆಗಳು ಮತ್ತು ನೆರವು", tip: "ಪರಿಶೀಲಿತ ನೆರವು ಯೋಜನೆಗಳನ್ನು ನೋಡಿ; ಅರ್ಹತೆ ಮತ್ತು ಕೊನೆಯ ದಿನಾಂಕ ಪರಿಶೀಲಿಸಲು ಅಧಿಕೃತ ಮೂಲ ತೆರೆಯಿರಿ. FarmAI ಅರ್ಹತೆಯನ್ನು ಖಚಿತಪಡಿಸುವುದಿಲ್ಲ.", prompts: ["ಯೋಜನೆಯ ಅರ್ಹತೆಯನ್ನು ಹೇಗೆ ಪರಿಶೀಲಿಸಲಿ?", "ಅಧಿಕೃತ ಅರ್ಜಿ ವಿವರಗಳು ಎಲ್ಲಿವೆ?"] },
    notifications: { name: "ಅಧಿಸೂಚನೆಗಳು", tip: "ಖಾತೆ ಮತ್ತು ಚಟುವಟಿಕೆ ಸೂಚನೆಗಳನ್ನು ಇಲ್ಲಿ ಪರಿಶೀಲಿಸಿ. ಮುಂದಿನ ಕ್ರಮಕ್ಕೆ ಸಂಬಂಧಿಸಿದ ದಾಖಲೆಯನ್ನು ತೆರೆಯಿರಿ; ಸೂಚನೆ ಓದಿದರೆ ಹೊಲದ ಮಾಹಿತಿ ಬದಲಾಗುವುದಿಲ್ಲ.", prompts: ["ಸಂಬಂಧಿತ ದಾಖಲೆಯನ್ನು ಹೇಗೆ ತೆರೆಯಲಿ?", "ಅಧಿಸೂಚನೆಗಳನ್ನು ಓದಿದಂತೆ ಹೇಗೆ ಗುರುತಿಸಲಿ?"] },
    history: { name: "ಚಟುವಟಿಕೆ ಇತಿಹಾಸ", tip: "ಖಾತೆಯಲ್ಲಿ ಉಳಿಸಿದ ಚಟುವಟಿಕೆ ಮತ್ತು ಬದಲಾವಣೆಗಳನ್ನು ನೋಡಿ. ದಾಖಲೆಯನ್ನು ಬದಲಿಸಲು ಸಂಬಂಧಿತ ಪುಟ ತೆರೆಯಿರಿ; ಇತಿಹಾಸವು ಹೊರಗಿನ ಕೆಲಸ ನಡೆದದ್ದಕ್ಕೆ ಸಾಕ್ಷಿಯಲ್ಲ.", prompts: ["ಹಳೆಯ ದಾಖಲೆಯನ್ನು ಹೇಗೆ ಹುಡುಕಲಿ?", "ಇತಿಹಾಸದ ದಾಖಲೆಯನ್ನು ಸಂಪಾದಿಸಬಹುದೇ?"] },
    performance: { name: "ಹೊಲದ ಕಾರ್ಯಕ್ಷಮತೆ", tip: "ಈ ಪುಟ FarmAI ದಾಖಲೆಗಳಲ್ಲಿ ಉಳಿಸಿದ ಮಾಹಿತಿಯ ಸಾರಾಂಶ ತೋರಿಸುತ್ತದೆ. ಇದು ಹಿಂದಿನ ಮಾಹಿತಿ ಮಾತ್ರ; ಇಳುವರಿ ಅಥವಾ ಆದಾಯದ ಭರವಸೆ ಅಲ್ಲ.", prompts: ["ಈ ಸಾರಾಂಶದಲ್ಲಿ ಯಾವ ದಾಖಲೆಗಳಿವೆ?", "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಮಾಹಿತಿಯನ್ನು ಹೇಗೆ ಸುಧಾರಿಸಲಿ?"] },
  },
  mr: {
    weather: { name: "हवामान", tip: "जतन केलेल्या ठिकाणाचे हवामान पाहा. माहिती नसल्यास किंवा अनुपलब्ध दाखवल्यास तिला अंदाज समजू नका; प्रोफाइलमध्ये ठिकाण अद्ययावत करा.", prompts: ["माझे ठिकाण कसे सेट करू?", "हवामान माहिती उपलब्ध का नाही?"] },
    schemes: { name: "योजना आणि मदत", tip: "तपासलेल्या सहाय्य योजना पाहा आणि पात्रता व अंतिम तारखांसाठी अधिकृत स्रोत उघडा. FarmAI पात्रतेची हमी देत नाही.", prompts: ["योजनेची पात्रता कशी तपासू?", "अर्जाची अधिकृत माहिती कुठे मिळेल?"] },
    notifications: { name: "सूचना", tip: "खाते आणि कृतींच्या सूचना येथे तपासा. पुढची कृती करण्यासाठी संबंधित नोंद उघडा; सूचना वाचल्याने शेताचा डेटा बदलत नाही.", prompts: ["संबंधित नोंद कशी उघडू?", "सूचना वाचल्याचे कसे चिन्हांकित करू?"] },
    history: { name: "कृतींचा इतिहास", tip: "खात्यात नोंदवलेल्या कृती आणि बदल पाहा. एखादी नोंद बदलण्यासाठी संबंधित पान उघडा; इतिहास म्हणजे बाहेरची कृती झाली याचा पुरावा नाही.", prompts: ["जुनी नोंद कशी शोधू?", "इतिहासातील नोंद संपादित करू शकतो का?"] },
    performance: { name: "शेताची कामगिरी", tip: "हे पान FarmAI नोंदींमध्ये जतन केलेल्या माहितीचा सारांश देते. हा मागील माहितीचा आढावा आहे; उत्पादन किंवा उत्पन्नाची हमी नाही.", prompts: ["या सारांशात कोणत्या नोंदी दिसतात?", "डॅशबोर्ड माहिती कशी सुधारू?"] },
  },
};

function getExtraPageHelp(path: string, language: Language): ExtraPageHelp | undefined {
  const cleanPath = path.split("?")[0];
  const page: ExtraPage | undefined = /\/weather(?:\/|$)/.test(cleanPath) ? "weather"
    : /\/schemes(?:\/|$)/.test(cleanPath) ? "schemes"
    : /\/notifications(?:\/|$)/.test(cleanPath) ? "notifications"
    : /\/history(?:\/|$)/.test(cleanPath) ? "history"
    : /\/performance(?:\/|$)/.test(cleanPath) ? "performance" : undefined;
  return page ? extraPageHelp[language][page] : undefined;
}

function pageTopic(path: string, role?: string): Topic {
  if (path === "/" || path === "/404") return "welcome";
  if (path.startsWith("/login") || path.startsWith("/register") || path === "/help") return path === "/help" ? "other" : "auth";
  if (!role && /^\/(?:farmer|buyer)(?:\/|$)/.test(path)) return "auth";
  if (/\/profile/.test(path)) return "profile";
  if (/\/ai/.test(path)) return "ai";
  if (/\/farms|\/fields/.test(path)) return "farms";
  if (/\/crops/.test(path)) return "crops";
  if (/\/health/.test(path)) return "health";
  if (/\/harvests/.test(path)) return "harvest";
  if (/\/tasks|\/irrigation|\/inputs|\/expenses/.test(path)) return "records";
  if (/\/requirements|\/matches/.test(path)) return "requirements";
  if (/\/interests|buyer-interests/.test(path)) return "interests";
  if (/\/transactions/.test(path)) return "transactions";
  if (/\/market|\/sell|\/listings/.test(path)) return path.includes("sell") || path.includes("listings") ? "harvest" : "market";
  if (path === "/farmer") return "farmerHome";
  if (path === "/buyer") return "buyerHome";
  return role === "farmer" ? "farmerHome" : role === "buyer" ? "buyerHome" : "other";
}

function localizedSpeechCode(language: Language) {
  return ({ en: "en-IN", hi: "hi-IN", kn: "kn-IN", mr: "mr-IN" } as Record<Language, string>)[language];
}
function localGuestAnswer(language: Language, topic: Topic, text: string, copyForLanguage: GuideCopy, pageTip = copyForLanguage.tips[topic]) {
  const question = text.toLocaleLowerCase();
  const topicTip = copyForLanguage.tips[topic];
  if (/password|पासवर्ड|ಪಾಸ್‌ವರ್ಡ್|पासवर्ड|login|sign in|लॉग.?इन|ಸೈನ್.?ಇನ್|साइन.?इन/.test(question) && topic !== "auth") return `${copyForLanguage.login}: ${copyForLanguage.tips.auth}`;
  return `${pageTip || topicTip}\n\n${copyForLanguage.guestNote}`;
}

export function AssistantGuide() {
  const [path] = useLocation();
  const { user, role } = useAuth();
  const { language } = useLanguage();
  const text = copy[language];
  const topic = pageTopic(path, role || undefined);
  const extraHelp = user ? getExtraPageHelp(path, language) : undefined;
  const pageName = extraHelp?.name || text.pageNames[topic];
  const pageTip = extraHelp?.tip || text.tips[topic];
  const userKey = user ? String(user._id || user.id || user.email) : "";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<GuideMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState("");
  const recognition = useRef<RecognitionLike | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const messageSequence = useRef(1);
  const suggestedQuestions = useMemo(() => extraHelp?.prompts || text.prompts[topic], [extraHelp, text, topic]);

  useEffect(() => {
    setMessages([]);
    setConversationId("");
    setDraft("");
    recognition.current?.stop();
    setListening(false);
  }, [userKey]);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, busy, open]);
  useEffect(() => () => {
    recognition.current?.stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  function speak(answer: string, id: number) {
    if (!("speechSynthesis" in window)) return;
    if (speakingId === id) { window.speechSynthesis.cancel(); setSpeakingId(null); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = localizedSpeechCode(language);
    utterance.rate = 0.96;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }

  function startVoice() {
    const browser = window as SpeechWindow;
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus(text.voiceUnsupported);
      return;
    }
    setVoiceStatus("");
    const instance = new Recognition();
    instance.lang = localizedSpeechCode(language);
    instance.interimResults = true;
    instance.continuous = false;
    instance.onresult = event => {
      const finalText: string[] = [];
      const interimText: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();
        if (!transcript) continue;
        (result.isFinal ? finalText : interimText).push(transcript);
      }
      if (finalText.length) setDraft(current => [current, finalText.join(" ")].filter(Boolean).join(" "));
      if (interimText.length) setVoiceStatus(`${text.listening} ${interimText.join(" ")}`);
    };
    instance.onerror = event => {
      setListening(false);
      setVoiceStatus(event.error === "not-allowed" || event.error === "service-not-allowed" ? text.voiceDenied : text.voiceNoSpeech);
    };
    instance.onend = () => {
      setListening(false);
      recognition.current = null;
      setVoiceStatus(current => current.startsWith(text.listening) ? "" : current);
    };
    recognition.current = instance;
    setListening(true);
    setVoiceStatus(text.listening);
    try { instance.start(); }
    catch { setListening(false); recognition.current = null; setVoiceStatus(text.voiceNoSpeech); }
  }

  async function send(raw: string, voice = false) {
    const question = raw.trim();
    if (!question || busy) return;
    setDraft("");
    setVoiceStatus("");
    setMessages(current => [...current, { id: messageSequence.current++, role: "user", text: question, voice }]);
    setBusy(true);
    try {
      if (!user) {
        const answer = localGuestAnswer(language, topic, question, text, pageTip);
        setMessages(current => [...current, { id: messageSequence.current++, role: "assistant", text: answer }]);
        return;
      }
      let id = conversationId;
      if (!id) {
        const result = await api.ai.createConversation({ title: `${text.title} · ${pageName}`.slice(0, 80), context: { assistant_mode: "page_guide", current_path: path, page: pageName, role } });
        id = recordId(result);
        if (!id) throw new Error("conversation_id_missing");
        setConversationId(id);
      }
      const appQuestion = `FarmSaathi app-support request. Current screen: ${pageName} (${path}). Account role: ${role || "unknown"}. Accurate help already shown for this page: ${pageTip}. Use it to explain the visible workflow. Be concise, give clear numbered steps, do not invent buttons or actions, and do not claim an action has been completed. User's question: ${question}`;
      const result = await api.ai.sendMessage(id, { message: appQuestion, input_type: voice ? "voice" : "text", language });
      const assistantMessage = result.assistant_message as { content?: unknown; availability?: unknown } | undefined;
      const isAvailable = result.provider_available !== false && assistantMessage?.availability !== "unavailable" && Boolean(assistantMessage?.content);
      const answer = isAvailable ? String(assistantMessage?.content) : `${text.aiUnavailable}\n\n${pageTip}`;
      setMessages(current => [...current, { id: messageSequence.current++, role: "assistant", text: answer }]);
    } catch {
      const answer = user ? `${text.connectionError}\n\n${pageTip}` : localGuestAnswer(language, topic, question, text, pageTip);
      setMessages(current => [...current, { id: messageSequence.current++, role: "assistant", text: answer }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return <div className="assistant-guide-root">
    {open && <section className="assistant-guide-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-guide-title">
      <header className="assistant-guide-header">
        <span className="assistant-guide-mark"><Sparkles size={18} /></span>
        <div className="assistant-guide-heading"><strong id="assistant-guide-title">{text.title}</strong><span>{text.page}: {pageName}</span></div>
        <button type="button" className="assistant-guide-close" aria-label={text.close} onClick={() => { setOpen(false); recognition.current?.stop(); setListening(false); }}><X size={18} /></button>
      </header>
      <div className="assistant-guide-feed" ref={feedRef} aria-live="polite">
        <div className="assistant-guide-welcome"><span className="assistant-guide-badge">{user ? text.title : text.guestBadge}</span><p>{text.intro.replace("{tip}", pageTip)}</p></div>
        {!user && <div className="assistant-guide-account-links"><Link href="/login" onClick={() => setOpen(false)}>{text.login}<ArrowRight size={14} /></Link><Link href="/register/farmer" onClick={() => setOpen(false)}>{text.farmerSignup}<ArrowRight size={14} /></Link><Link href="/register/buyer" onClick={() => setOpen(false)}>{text.buyerSignup}<ArrowRight size={14} /></Link></div>}
        {!messages.length && <div className="assistant-guide-prompts"><span>{text.suggestions}</span>{suggestedQuestions.map(question => <button type="button" key={question} disabled={busy} onClick={() => void send(question)}>{question}<ArrowRight size={13} /></button>)}</div>}
        {messages.map(item => <article className={`assistant-guide-message ${item.role === "user" ? "guide-user-message" : "guide-ai-message"}`} key={item.id}>
          <div className="assistant-guide-message-copy"><small>{item.role === "user" ? (item.voice ? text.voiceStart : text.you) : "FarmSaathi"}</small><p>{item.text}</p></div>
          {item.role === "assistant" && "speechSynthesis" in window && <button type="button" className="assistant-guide-speak" aria-label={speakingId === item.id ? text.stopSpeaking : text.speak} title={speakingId === item.id ? text.stopSpeaking : text.speak} onClick={() => speak(item.text, item.id)}><Volume2 size={14} /></button>}
        </article>)}
        {busy && <div className="assistant-guide-thinking"><span /><span /><span /> FarmSaathi</div>}
      </div>
      {!user && <div className="assistant-guide-guest-note">{text.guestNote}</div>}
      {voiceStatus && <div className="assistant-guide-voice-status" role="status">{voiceStatus}</div>}
      <form className="assistant-guide-composer" onSubmit={submit}>
        <textarea aria-label={text.composer} placeholder={text.composer} rows={2} maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={handleKeyDown} />
        <div className="assistant-guide-composer-actions">
          <button type="button" className={`assistant-guide-mic ${listening ? "is-listening" : ""}`} aria-label={listening ? text.voiceStop : text.voiceStart} title={listening ? text.voiceStop : text.voiceStart} onClick={() => listening ? recognition.current?.stop() : startVoice()}>{listening ? <MicOff size={17} /> : <Mic size={17} />}</button>
          <span className="assistant-guide-voice-hint"><Headphones size={13} /> {localizedSpeechCode(language)}</span>
          <button className="assistant-guide-send" type="submit" aria-label={text.send} title={text.send} disabled={!draft.trim() || busy}>{busy ? <span className="assistant-guide-send-dot" /> : <Send size={16} />}</button>
        </div>
      </form>
    </section>}
    <button type="button" className={`assistant-guide-launcher ${open ? "is-open" : ""}`} aria-expanded={open} aria-label={open ? text.close : text.launcher} onClick={() => setOpen(value => !value)}>
      {open ? <X size={20} /> : <span className="assistant-guide-launcher-icon"><Sparkles size={19} /></span>}
      <span>{open ? text.title : text.launcher}</span>
    </button>
  </div>;
}

export default AssistantGuide;
