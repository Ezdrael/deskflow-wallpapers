import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DeskflowWallpapersPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();
        
        window.set_default_size(700, 600);
        window.set_title("Налаштування Deskflow Wallpapers");
        
        const page = new Adw.PreferencesPage();
        
        this._workspacesGroup = new Adw.PreferencesGroup({
            title: 'Робочі столи',
            description: 'Встановіть індивідуальні шпалери для кожного з виявлених робочих просторів.'
        });
        page.add(this._workspacesGroup);
        
        this._workspaceRows = [];
        this._updateWorkspacesList();
        
        this._settings.connect('changed::workspace-count', () => {
            this._updateWorkspacesList();
        });
        
        const extraGroup = new Adw.PreferencesGroup({
            title: 'Додатково'
        });
        page.add(extraGroup);
        
        const indicatorRow = new Adw.SwitchRow({
            title: 'Значок на панелі',
            subtitle: 'Показувати меню швидкого доступу у верхній панелі GNOME'
        });
        this._settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        extraGroup.add(indicatorRow);
        
        const delayRow = new Adw.SpinRow({
            title: 'Затримка перемикання (мс)',
            subtitle: 'Час очікування перед зміною шпалер (запобігає мерехтінню при швидкому гортанні)',
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 2000, step_increment: 50 })
        });
        this._settings.bind('switch-delay', delayRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        extraGroup.add(delayRow);
        
        window.add(page);
    }
    
    _updateWorkspacesList() {
        for (const row of this._workspaceRows) {
            this._workspacesGroup.remove(row);
        }
        this._workspaceRows = [];
        
        const count = this._settings.get_int('workspace-count');
        const mapStr = this._settings.get_string('wallpapers-map');
        let map = {};
        try { map = JSON.parse(mapStr); } catch(e) {}
        
        for (let i = 0; i < count; i++) {
            const row = new Adw.ActionRow({
                title: `Робочий стіл ${i + 1}`,
                subtitle: map[i] ? map[i].replace('file://', '') : 'За замовчуванням'
            });
            
            const pickBtn = new Gtk.Button({
                icon_name: 'document-open-symbolic',
                valign: Gtk.Align.CENTER,
                tooltip_text: 'Вибрати шпалери',
                css_classes: ['flat']
            });
            pickBtn.connect('clicked', () => this._chooseWallpaper(i, row));
            row.add_suffix(pickBtn);
            
            const clearBtn = new Gtk.Button({
                icon_name: 'edit-clear-symbolic',
                valign: Gtk.Align.CENTER,
                tooltip_text: 'Скинути шпалери',
                css_classes: ['flat']
            });
            clearBtn.connect('clicked', () => {
                const currentMapStr = this._settings.get_string('wallpapers-map');
                let currentMap = {};
                try { currentMap = JSON.parse(currentMapStr); } catch(e) {}
                delete currentMap[i];
                this._settings.set_string('wallpapers-map', JSON.stringify(currentMap));
                row.set_subtitle('За замовчуванням');
            });
            row.add_suffix(clearBtn);
            
            this._workspacesGroup.add(row);
            this._workspaceRows.push(row);
        }
    }
    
    _chooseWallpaper(index, row) {
        const dialog = new Gtk.FileDialog({
            title: `Вибрати шпалери для Робочого столу ${index + 1}`
        });
        
        const filter = new Gtk.FileFilter();
        filter.set_name('Зображення');
        filter.add_mime_type('image/png');
        filter.add_mime_type('image/jpeg');
        filter.add_mime_type('image/webp');
        filter.add_mime_type('image/svg+xml');
        
        const filters = Gio.ListStore.new(Gtk.FileFilter);
        filters.append(filter);
        dialog.set_filters(filters);
        
        const window = row.get_root();
        
        dialog.open(window, null, (source, res) => {
            try {
                const file = source.open_finish(res);
                if (file) {
                    const uri = file.get_uri();
                    const currentMapStr = this._settings.get_string('wallpapers-map');
                    let currentMap = {};
                    try { currentMap = JSON.parse(currentMapStr); } catch(e) {}
                    
                    currentMap[index] = uri;
                    this._settings.set_string('wallpapers-map', JSON.stringify(currentMap));
                    row.set_subtitle(uri.replace('file://', ''));
                }
            } catch (e) {
                // Скасовано або сталася помилка
            }
        });
    }
}
