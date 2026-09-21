use once_cell::sync::Lazy;
use serde::Serialize;
use std::sync::Mutex;

#[derive(Clone, Serialize)]
pub struct SystemFont {
    family: String,
    display_name: String,
    aliases: Vec<String>,
}

// Enumerate on a blocking worker once per process, never on the window's UI thread.
static FONT_CACHE: Lazy<Mutex<Option<Vec<SystemFont>>>> = Lazy::new(|| Mutex::new(None));

#[tauri::command]
pub async fn list_fonts() -> Result<Vec<SystemFont>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut cache = FONT_CACHE.lock().map_err(|error| error.to_string())?;
        if cache.is_none() { *cache = Some(enumerate_fonts()?); }
        Ok(cache.as_ref().expect("font cache initialized").clone())
    }).await.map_err(|error| error.to_string())?
}

#[cfg(windows)]
fn enumerate_fonts() -> Result<Vec<SystemFont>, String> {
    use windows::{
        core::{w, BOOL, PCWSTR},
        Win32::{Globalization::GetUserDefaultLocaleName, Graphics::DirectWrite::{
            DWriteCreateFactory, IDWriteFactory, IDWriteLocalizedStrings, DWRITE_FACTORY_TYPE_SHARED,
        }},
    };

    fn localized_index(names: &IDWriteLocalizedStrings, locale: PCWSTR) -> Option<u32> {
        let mut index = 0;
        let mut exists = BOOL::default();
        // DirectWrite owns the strings; all output pointers refer to live stack values.
        unsafe { names.FindLocaleName(locale, &mut index, &mut exists).ok()?; }
        exists.as_bool().then_some(index)
    }
    fn name_at(names: &IDWriteLocalizedStrings, index: u32) -> Result<String, String> {
        // Allocate the reported UTF-16 length plus its terminator before reading.
        unsafe {
            let length = names.GetStringLength(index).map_err(|error| error.to_string())?;
            let mut buffer = vec![0; length as usize + 1];
            names.GetString(index, &mut buffer).map_err(|error| error.to_string())?;
            Ok(String::from_utf16_lossy(&buffer[..length as usize]))
        }
    }

    // Only read family metadata. No font files or glyph previews are loaded by the app.
    unsafe {
        let factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED).map_err(|error| error.to_string())?;
        let mut collection = None;
        factory.GetSystemFontCollection(&mut collection, false).map_err(|error| error.to_string())?;
        let collection = collection.ok_or("无法读取 Windows 字体列表")?;
        let mut locale = [0u16; 85];
        let has_locale = GetUserDefaultLocaleName(&mut locale) > 0;
        let mut fonts = Vec::new();
        for index in 0..collection.GetFontFamilyCount() {
            let names = collection.GetFontFamily(index).and_then(|family| family.GetFamilyNames()).map_err(|error| error.to_string())?;
            if names.GetCount() == 0 { continue; }
            let english = localized_index(&names, w!("en-us")).unwrap_or(0);
            let localized = if has_locale { localized_index(&names, PCWSTR(locale.as_ptr())) } else { None }.unwrap_or(english);
            let family = name_at(&names, english)?;
            if family.is_empty() || family.starts_with('@') { continue; }
            let display_name = name_at(&names, localized)?;
            let mut aliases = (0..names.GetCount()).map(|i| name_at(&names, i)).collect::<Result<Vec<_>, _>>()?;
            aliases.sort();
            aliases.dedup();
            fonts.push(SystemFont { family, display_name, aliases });
        }
        fonts.sort_by_cached_key(|font| font.family.to_lowercase());
        fonts.dedup_by(|a, b| a.family.eq_ignore_ascii_case(&b.family));
        Ok(fonts)
    }
}

#[cfg(not(windows))]
fn enumerate_fonts() -> Result<Vec<SystemFont>, String> {
    Err("系统字体选择目前仅支持 Windows".into())
}
