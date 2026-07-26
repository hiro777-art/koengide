-- HTMLに書かれていた設備情報をSupabaseへ書き戻すSQL
-- rebuild-all.js が自動生成
-- 実行前に必ずバックアップを取ること:
--   create table parks_backup_20260726 as select * from parks;
update parks set has_slide = true, has_sandbox = false, has_complex_play = true, has_bench = true, has_shade = true, has_ballplay = true where id = 1;  -- こどもの国（児童センター）
update parks set has_slide = true, has_toilet = true, has_complex_play = true, has_bench = true, has_ballplay = true where id = 2;  -- 本町1丁目児童遊園地
update parks set has_ballplay = true where id = 5;  -- 本町4丁目児童遊園地
update parks set has_swing = true, has_sandbox = false, has_complex_play = true, has_bench = true where id = 10;  -- 元蕨第三公園
update parks set has_swing = true, has_sandbox = true, has_toilet = true, has_water = true, has_bench = true, has_shade = true, has_ballplay = true where id = 11;  -- 元蕨第二公園
update parks set has_complex_play = true where id = 12;  -- 元蕨第一公園
update parks set has_swing = true, has_complex_play = true, has_bench = true, has_shade = true, has_ballplay = true where id = 13;  -- 東町公園
update parks set has_slide = false, has_water = true, has_bench = true, has_shade = true, has_ballplay = true, has_parking = true where id = 15;  -- 後谷公園
update parks set has_bench = false, has_shade = true where id = 17;  -- 後谷第一公園
update parks set has_toilet = true, has_water = true, has_bench = true, has_ballplay = true where id = 18;  -- 後谷児童遊園地
update parks set has_swing = true, has_complex_play = true, has_bench = true, has_shade = true, has_ballplay = true, has_dog = false where id = 19;  -- 川岸公園
update parks set has_toilet = true, has_complex_play = true, has_bench = true, has_shade = true where id = 24;  -- 下戸田1丁目児童公園
update parks set has_toilet = true, has_complex_play = true where id = 25;  -- 下戸田第一公園
update parks set has_toilet = true, has_bench = true, has_ballplay = true where id = 26;  -- 下戸田第二公園
update parks set has_swing = true, has_slide = true, has_sandbox = true, has_toilet = true, has_bench = true, has_shade = true, has_ballplay = true, has_health_equipment = true where id = 44;  -- 中町公園
update parks set has_swing = true, has_slide = true, has_sandbox = true, has_toilet = true, has_complex_play = true, has_bench = true, has_shade = true, has_ballplay = true where id = 45;  -- 後第一公園
update parks set has_swing = true, has_slide = true, has_sandbox = true, has_water = true, has_complex_play = true, has_bench = true, has_shade = true, has_ballplay = true where id = 46;  -- 後第二公園
update parks set has_swing = true, has_slide = true, has_sandbox = true, has_toilet = true, has_shade = true where id = 48;  -- 立野際公園
update parks set has_toilet = true, has_bench = true, has_ballplay = true where id = 54;  -- 中町多目的広場
update parks set has_toilet = true, has_water = true, has_bench = true, has_shade = true, has_ballplay = true where id = 55;  -- 喜沢第二公園
update parks set has_swing = true, has_slide = true, has_sandbox = true, has_toilet = true where id = 72;  -- 中町２丁目児童遊園地
update parks set has_swing = true, has_slide = true, has_complex_play = true, has_bench = true where id = 73;  -- 喜沢南2丁目児童遊園地
