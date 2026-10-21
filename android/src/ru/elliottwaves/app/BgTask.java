package ru.elliottwaves.app;

// фоновая проверка без окна: worker.html по окончании зовёт Android.done() → finish()
interface BgTask {
    void finish();
}
